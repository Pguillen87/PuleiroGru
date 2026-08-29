import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { parseReadyManifest, publishMascotPackage, resolveMascotImportCode, type PackageAsset, type PackageRecoveryStage } from "@/lib/mascot-generation/package-store";
import { FixtureAudit, FixtureProviderFetchAudit, FixtureStageError, fixtureErrorResponse } from "@/lib/mascot-generation/fixture-observability";
import { countFixtureSourceRoles, resolveFixtureSource, resolveProviderFixtureSource, type FixtureSource } from "@/lib/mascot-generation/fixture-source";
import { fixtureSourceRoles, inspectPoseQc, poseSetVisualV2Thresholds, shortHash } from "@/lib/mascot-generation/fixture-source-inspection";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { jobIdentity } from "@/lib/mascot-generation/attempt";

export const runtime = "nodejs";

// The approved pose smoke is a Modal clone and deliberately has no separate
// Supabase attempt row. This immutable QA anchor is the server-side owner and
// attempt binding used to read that clone; browser input never participates.
const ATTEMPT_ANCHOR_JOB_ID = "job_ad22b714e3547391e9654abf1ece384b";
const FIXTURE_SOURCE_JOB_ID = "job_43136e0b5283358281bc1d4c6efa8c01";
const checkpoints = new Set<PackageRecoveryStage>(["after_asset_1", "after_assets_3", "after_manifest", "after_code", "before_ready", "after_ready"]);

class FixtureAbort extends Error {}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ code: "FIXTURE_DISABLED" }, { status: 404 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const action = await requestedAction(request);
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ code: "SESSION_REQUIRED" }, { status: 401 });
    await requireFixtureOwner();
    if (action === "inspect_source") return NextResponse.json(await inspectSource(identity.uid));
    return NextResponse.json(await runFixture(identity.uid, action));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const failure = fixtureErrorResponse(error, "FIXTURE_ITEM_CREATE");
    return NextResponse.json(failure, { status: 409 });
  }
}

async function requestedAction(request: Request): Promise<PackageRecoveryStage | "inspect_source"> {
  const value = (await request.json().catch(() => null) as { checkpoint?: unknown; action?: unknown } | null);
  if (value?.action === "inspect_source") return "inspect_source";
  const checkpoint = value?.checkpoint;
  if (typeof checkpoint !== "string" || !checkpoints.has(checkpoint as PackageRecoveryStage)) throw new Error("FIXTURE_CHECKPOINT_INVALID");
  return checkpoint as PackageRecoveryStage;
}

async function requireFixtureOwner() {
  const expectedEmail = process.env.SUPABASE_RECOVERY_TEST_EMAIL?.trim().toLowerCase();
  if (!expectedEmail) throw new Error("FIXTURE_OWNER_NOT_CONFIGURED");
  const { data, error } = await (await createClient()).auth.getUser();
  if (error || data.user?.email?.toLowerCase() !== expectedEmail) throw new Error("FIXTURE_OWNER_REJECTED");
}

async function runFixture(userId: string, checkpoint: PackageRecoveryStage) {
  const admin = createAdminClient();
  if (!admin) throw new Error("FIXTURE_STORAGE_UNAVAILABLE");
  const audit = new FixtureAudit();
  let item: { id: string; mascotCode: string } | undefined;
  const assets = new Map<string, PackageAsset>();
  let packageId = "";
  let failedAsExpected = false;
  let result: Record<string, unknown> | undefined;
  let failure: unknown;
  try {
    audit.start("FIXTURE_PROVIDER_FETCH");
    const providerAudit = new FixtureProviderFetchAudit(audit.operationId);
    const source = await loadFixtureSource(admin, userId, providerAudit);
    const resolvedSource = await inspectFixtureProviderSource(userId, source, providerAudit);
    audit.succeed();
    audit.start("FIXTURE_ITEM_CREATE");
    try {
      item = await createFixtureItem(admin, userId, checkpoint, resolvedSource.source);
      audit.succeed();
    } catch (error) {
      throw audit.fail(error);
    }
    try {
      await publishMascotPackage(await createClient(), userId, item.id, {
        onAssetStored: (asset, id) => { assets.set(asset.storagePath, asset); packageId = id; },
        afterStage: (stage, id) => { packageId = id; if (stage === checkpoint) throw new FixtureAbort(); },
        onLifecycleStage: (stage, count) => audit.start(stage, count),
      });
    } catch (error) {
      if (!(error instanceof FixtureAbort)) throw audit.fail(error);
      audit.succeed(assets.size);
      failedAsExpected = true;
    }
    const pending = await fixtureState(admin, userId, item.id, packageId, item.mascotCode);
    const replay = await publishMascotPackage(await createClient(), userId, item.id);
    packageId = replay.package.id;
    const manifest = parseReadyManifest(replay.package.manifest);
    if (!manifest) throw audit.fail(new Error("manifest"));
    for (const asset of manifest.assets) assets.set(asset.storagePath, asset);
    const ready = await fixtureState(admin, userId, item.id, packageId, item.mascotCode);
    result = {
      checkpoint, failedAsExpected, readyBeforeReplay: pending.packageStatus === "ready", codeResolvedBeforeReady: pending.codeResolved,
      replayReady: ready.packageStatus === "ready", replayCodeResolved: ready.codeResolved,
      counts: { assets: assets.size },
    };
  } catch (error) {
    failure = error;
  }

  if (item) {
    audit.start("FIXTURE_CLEANUP", assets.size);
    try {
      await cleanupFixture(admin, item.id, packageId, [...assets.keys()]);
      audit.succeed();
    } catch (error) {
      const cleanupFailure = audit.fail(error);
      if (!failure) failure = cleanupFailure;
    }
  }

  if (failure) throw failure;
  if (!item || !result) throw audit.fail(new Error("fixture result"));
  try {
    const cleanup = await fixtureState(admin, userId, item.id, packageId, item.mascotCode);
    const qa = await admin.from("mascot_library_items").select("id", { count: "exact", head: true }).eq("modal_job_id", ATTEMPT_ANCHOR_JOB_ID);
    return {
      ...result,
      counts: { ...(result.counts as Record<string, number>), postCleanupItems: cleanup.items, postCleanupPackages: cleanup.packages, postCleanupCodes: cleanup.codes },
      qaJobLibraryItems: qa.count ?? 0,
    };
  } catch {
    throw new FixtureStageError("FIXTURE_CLEANUP", "FIXTURE_CLEANUP_VERIFY_FAILED");
  }
}

async function loadFixtureSource(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  audit: FixtureProviderFetchAudit,
): Promise<FixtureSource> {
  audit.start("PROVIDER_ATTEMPT_RESOLVE");
  try {
    const { data, error } = await admin.from("mascot_attempts")
      .select("user_id, attempt_id, selected_master_id")
      .eq("modal_job_id", ATTEMPT_ANCHOR_JOB_ID)
      .eq("user_id", userId)
      .maybeSingle<{ user_id: string; attempt_id: string; selected_master_id: string | null }>();
    const source = !error ? resolveFixtureSource(data, userId, FIXTURE_SOURCE_JOB_ID) : null;
    audit.succeed({ attemptPresent: Boolean(source) });
    if (!source) throw new Error("FIXTURE_SOURCE_UNAVAILABLE");
    return source;
  } catch (error) {
    if (error instanceof FixtureStageError) throw error;
    throw audit.fail(error);
  }
}

async function inspectSource(userId: string) {
  const admin = createAdminClient();
  if (!admin) throw new FixtureStageError("FIXTURE_PROVIDER_FETCH", "FIXTURE_STORAGE_UNAVAILABLE");
  const audit = new FixtureProviderFetchAudit(`fixture-inspect-${crypto.randomUUID()}`);
  const reader = await loadFixtureSource(admin, userId, audit);
  const resolved = await inspectFixtureProviderSource(userId, reader, audit);
  const job = resolved.job;
  const provider = getMascotGenerationProvider();
  const identity = jobIdentity(userId, resolved.source.attemptId);
  const poses = [];
  for (const role of fixtureSourceRoles) {
    const pose = job.poses.filter((entry) => entry.role === role);
    const image = pose.length === 1 ? await provider.getPoseImage?.(job.id, role, identity) : null;
    const actualHash = image ? createHash("sha256").update(image.bytes).digest("hex") : undefined;
    const metadata = image ? await sharp(image.bytes).metadata() : undefined;
    poses.push({
      role,
      count: pose.length,
      manifestHash: shortHash(pose[0]?.sha256),
      servedHash: shortHash(actualHash),
      hashMatches: Boolean(pose[0]?.sha256 && actualHash === pose[0].sha256),
      pngRgba: metadata?.format === "png" && metadata.hasAlpha === true,
      qc: inspectPoseQc(pose[0]?.qc as Record<string, unknown> | undefined),
    });
  }
  return {
    jobId: job.id,
    sourceAttemptResolvedServerSide: Boolean(job.attemptId),
    jobStatus: job.status,
    poseSetQc: job.poseSetQc,
    poseSetVisualV2Thresholds,
    poses,
  };
}

async function inspectFixtureProviderSource(userId: string, source: FixtureSource, audit: FixtureProviderFetchAudit) {
  try {
    audit.start("PROVIDER_CLIENT_CREATE");
    const provider = getMascotGenerationProvider();
    audit.succeed();

    audit.start("PROVIDER_AUTH_BUILD");
    const identity = jobIdentity(userId, source.attemptId);
    audit.succeed({ attemptPresent: Boolean(source.attemptId) });

    audit.start("PROVIDER_JOB_FETCH");
    const job = await provider.getJob(source.jobId, identity);
    audit.succeed({ httpStatus: job ? 200 : 404, jobPresent: Boolean(job) });
    if (!job) throw new Error("FIXTURE_SOURCE_UNAVAILABLE");

    audit.start("PROVIDER_ATTEMPT_RESOLVE");
    const resolvedSource = resolveProviderFixtureSource(source, job);
    audit.succeed({ attemptPresent: Boolean(resolvedSource) });
    if (!resolvedSource) throw new Error("FIXTURE_SOURCE_ATTEMPT_INVALID");

    audit.start("PROVIDER_OWNERSHIP_VALIDATE");
    // The BFF-issued JWT constrains this read to the authenticated owner;
    // matching the server-resolved attempt prevents a permissive fallback.
    audit.succeed({ jobPresent: true, attemptPresent: true });

    audit.start("PROVIDER_RESPONSE_PARSE");
    audit.succeed({ jobPresent: true, poseCount: job.poses.length });

    audit.start("PROVIDER_POSE_SET_FETCH");
    const poseCount = countFixtureSourceRoles(job.poses, fixtureSourceRoles);
    audit.succeed({ poseCount });
    if (poseCount !== fixtureSourceRoles.length) throw new Error("FIXTURE_SOURCE_POSES_INCOMPLETE");
    return { job, source: resolvedSource };
  } catch (error) {
    if (error instanceof FixtureStageError) throw error;
    throw audit.fail(error);
  }
}

async function createFixtureItem(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string, checkpoint: string, source: FixtureSource) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const code = `GRU-${[0, 4].map((offset) => Array.from(bytes.subarray(offset, offset + 4), (value) => alphabet[value % alphabet.length]).join("")).join("-")}`;
  const { data, error } = await admin.from("mascot_library_items").insert({
    user_id: userId, attempt_id: source.attemptId, modal_job_id: source.jobId, master_id: source.masterId,
    display_name: `Fixture ${checkpoint}`, mascot_code: code, pose_snapshot: [],
  }).select("id, mascot_code").single<{ id: string; mascot_code: string }>();
  if (error || !data) throw new Error("FIXTURE_ITEM_CREATE_FAILED");
  return { id: data.id, mascotCode: data.mascot_code };
}

async function fixtureState(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string, itemId: string, packageId: string, code: string) {
  const packageRow = packageId ? await admin.from("mascot_packages").select("status").eq("id", packageId).eq("library_item_id", itemId).maybeSingle<{ status: string }>() : { data: null };
  const resolved = packageId ? await resolveMascotImportCode(admin, code) : null;
  const [items, packages, codes] = await Promise.all([
    admin.from("mascot_library_items").select("id", { count: "exact", head: true }).eq("id", itemId).eq("user_id", userId),
    packageId ? admin.from("mascot_packages").select("id", { count: "exact", head: true }).eq("id", packageId).eq("user_id", userId) : Promise.resolve({ count: 0 }),
    packageId ? admin.from("mascot_import_codes").select("id", { count: "exact", head: true }).eq("package_id", packageId).eq("user_id", userId) : Promise.resolve({ count: 0 }),
  ]);
  return { packageStatus: packageRow.data?.status ?? null, codeResolved: Boolean(resolved), items: items.count ?? 0, packages: packages.count ?? 0, codes: codes.count ?? 0 };
}

async function cleanupFixture(admin: NonNullable<ReturnType<typeof createAdminClient>>, itemId: string, packageId: string, paths: string[]) {
  if (paths.length) await admin.storage.from("mascot-packages").remove(paths);
  if (packageId) await admin.from("mascot_import_codes").delete().eq("package_id", packageId);
  if (packageId) await admin.from("mascot_packages").delete().eq("id", packageId);
  await admin.from("mascot_library_items").delete().eq("id", itemId);
}
