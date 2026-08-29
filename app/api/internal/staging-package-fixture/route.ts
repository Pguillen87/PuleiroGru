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
import { removeAndVerifyFixtureStorage, summarizeFixtureStorageVerification, verifyExactFixtureStorage, type FixtureStorageCleanupResult } from "@/lib/mascot-generation/fixture-storage-cleanup";
import { createFixtureRunRegistry, deleteFixtureRunRegistry, markFixtureRunCleanup, updateFixtureRunRegistry } from "@/lib/mascot-generation/fixture-run-registry";
import { recoverExactFixtureDatabase, type FixtureRecoveryGateway, type FixtureRecoveryRegistry } from "@/lib/mascot-generation/fixture-recovery";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { jobIdentity } from "@/lib/mascot-generation/attempt";

export const runtime = "nodejs";

// The approved pose smoke is a Modal clone and deliberately has no separate
// Supabase attempt row. This immutable QA anchor is the server-side owner and
// attempt binding used to read that clone; browser input never participates.
const ATTEMPT_ANCHOR_JOB_ID = "job_ad22b714e3547391e9654abf1ece384b";
const FIXTURE_SOURCE_JOB_ID = "job_43136e0b5283358281bc1d4c6efa8c01";
const PREVIOUS_AFTER_ASSET_1_OPERATION_ID = "fixture-434b44e3-67fc-4c66-9f40-b130f7872bca";
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
    if (action === "inspect_previous_cleanup_storage") return NextResponse.json(await inspectPreviousCleanupStorage(identity.uid));
    if (action === "recover_previous_after_asset_1") return NextResponse.json(await recoverPreviousAfterAssetOne(identity.uid));
    return NextResponse.json(await runFixture(identity.uid, action));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const failure = fixtureErrorResponse(error, "FIXTURE_ITEM_CREATE");
    return NextResponse.json(failure, { status: 409 });
  }
}

async function requestedAction(request: Request): Promise<PackageRecoveryStage | "inspect_source" | "inspect_previous_cleanup_storage" | "recover_previous_after_asset_1"> {
  const value = (await request.json().catch(() => null) as { checkpoint?: unknown; action?: unknown } | null);
  if (value?.action === "inspect_source") return "inspect_source";
  if (value?.action === "inspect_previous_cleanup_storage") return "inspect_previous_cleanup_storage";
  if (value?.action === "recover_previous_after_asset_1") return "recover_previous_after_asset_1";
  const checkpoint = value?.checkpoint;
  if (typeof checkpoint !== "string" || !checkpoints.has(checkpoint as PackageRecoveryStage)) throw new Error("FIXTURE_CHECKPOINT_INVALID");
  return checkpoint as PackageRecoveryStage;
}

async function inspectPreviousCleanupStorage(userId: string) {
  const admin = createAdminClient();
  if (!admin) throw new FixtureStageError("FIXTURE_CLEANUP", "FIXTURE_STORAGE_UNAVAILABLE");
  const { data, error } = await admin.from("staging_package_fixture_runs")
    .select("storage_paths")
    .eq("operation_id", PREVIOUS_AFTER_ASSET_1_OPERATION_ID)
    .eq("user_id", userId)
    .eq("source_job_id", FIXTURE_SOURCE_JOB_ID)
    .maybeSingle<{ storage_paths: unknown }>();
  const paths = fixtureRegistryPaths(data?.storage_paths);
  if (error || paths.length !== fixtureSourceRoles.length) {
    throw new FixtureStageError("FIXTURE_CLEANUP", "FIXTURE_RECOVERY_RECORD_INVALID");
  }
  const objects = await verifyExactFixtureStorage(paths, {
    verifyExact: async (path) => {
      const { data: exists, error: storageError } = await admin.storage.from("mascot-packages").exists(path);
      return {
        exists,
        httpStatus: storageError ? storageErrorStatus(storageError) : exists === true ? 200 : null,
        errorCode: storageError ? "FIXTURE_STORAGE_VERIFY_SDK_FAILED" : null,
        errorName: storageError ? storageErrorName(storageError) : null,
        safeMessage: storageError ? storageErrorMessage(storageError) : null,
        pathPresent: Boolean(path),
        bucketPresent: true,
        authPresent: true,
      };
    },
  });
  return { method: "exists", objects, ...summarizeFixtureStorageVerification(objects) };
}

async function recoverPreviousAfterAssetOne(userId: string) {
  const admin = createAdminClient();
  if (!admin) throw new FixtureStageError("FIXTURE_CLEANUP", "FIXTURE_STORAGE_UNAVAILABLE");
  const { data, error } = await admin.from("staging_package_fixture_runs")
    .select("item_id, package_id, import_code_id, storage_paths, cleanup_counts")
    .eq("operation_id", PREVIOUS_AFTER_ASSET_1_OPERATION_ID)
    .eq("user_id", userId)
    .eq("source_job_id", FIXTURE_SOURCE_JOB_ID)
    .maybeSingle<{ item_id: string | null; package_id: string | null; import_code_id: string | null; storage_paths: unknown; cleanup_counts: unknown }>();
  const paths = fixtureRegistryPaths(data?.storage_paths);
  const registryState = fixtureRecoveryRegistry(data, paths);
  if (error || !registryState) {
    throw new FixtureStageError("FIXTURE_CLEANUP", "FIXTURE_RECOVERY_RECORD_INVALID");
  }
  const registry = { operationId: PREVIOUS_AFTER_ASSET_1_OPERATION_ID, userId };
  await markFixtureRunCleanup(admin, registry, "cleaning");
  try {
    const counts = await recoverExactFixtureDatabase(registryState, userId, fixtureRecoveryGateway(admin));
    await markFixtureRunCleanup(admin, registry, "cleaned", {
      storageObjectsExpected: paths.length,
      storageObjectsRemaining: 0,
      storageCleanupVerified: true,
    });
    await deleteFixtureRunRegistry(admin, registry);
    return {
      storageObjectsExpected: paths.length,
      storageObjectsRemaining: 0,
      storageCleanupVerified: true,
      ...counts,
    };
  } catch (error) {
    await markFixtureRunCleanup(admin, registry, "failed").catch(() => undefined);
    throw error;
  }
}

function fixtureRecoveryRegistry(
  data: { item_id: string | null; package_id: string | null; import_code_id: string | null; storage_paths: unknown; cleanup_counts: unknown } | null,
  paths: string[],
): FixtureRecoveryRegistry | null {
  const cleanup = data?.cleanup_counts;
  if (!data?.item_id || !data.package_id || !data.import_code_id || !isVerifiedStorageCleanup(cleanup)) return null;
  return {
    itemId: data.item_id,
    packageId: data.package_id,
    importCodeId: data.import_code_id,
    sourceJobId: FIXTURE_SOURCE_JOB_ID,
    storagePaths: paths,
    storageCleanupVerified: true,
    storageObjectsRemaining: 0,
  };
}

function isVerifiedStorageCleanup(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as { storageCleanupVerified?: unknown; storageObjectsRemaining?: unknown };
  return record.storageCleanupVerified === true && record.storageObjectsRemaining === 0;
}

function fixtureRecoveryGateway(admin: NonNullable<ReturnType<typeof createAdminClient>>): FixtureRecoveryGateway {
  return {
    getImportCode: async (id) => fixtureRecoveryRow(admin.from("mascot_import_codes").select("id, user_id, package_id").eq("id", id).maybeSingle(), "package_id"),
    getPackage: async (id) => fixtureRecoveryRow(admin.from("mascot_packages").select("id, user_id, library_item_id").eq("id", id).maybeSingle(), "library_item_id"),
    getItem: async (id) => fixtureRecoveryRow(admin.from("mascot_library_items").select("id, user_id, modal_job_id").eq("id", id).maybeSingle(), "modal_job_id"),
    deleteImportCode: async (id) => exactFixtureDelete(admin.from("mascot_import_codes").delete().eq("id", id), "FIXTURE_IMPORT_CODE_DELETE_FAILED"),
    deletePackage: async (id) => exactFixtureDelete(admin.from("mascot_packages").delete().eq("id", id), "FIXTURE_PACKAGE_DELETE_FAILED"),
    deleteItem: async (id) => exactFixtureDelete(admin.from("mascot_library_items").delete().eq("id", id), "FIXTURE_ITEM_DELETE_FAILED"),
    remaining: async (ids) => {
      const [items, packages, codes] = await Promise.all([
        admin.from("mascot_library_items").select("id", { count: "exact", head: true }).eq("id", ids.itemId),
        admin.from("mascot_packages").select("id", { count: "exact", head: true }).eq("id", ids.packageId),
        admin.from("mascot_import_codes").select("id", { count: "exact", head: true }).eq("id", ids.importCodeId),
      ]);
      if (items.error || packages.error || codes.error) throw new Error("FIXTURE_DB_CLEANUP_VERIFY_FAILED");
      return { items: items.count ?? 0, packages: packages.count ?? 0, codes: codes.count ?? 0 };
    },
  };
}

async function fixtureRecoveryRow(
  query: PromiseLike<{ data: { id: string; user_id: string; package_id?: string | null; library_item_id?: string | null; modal_job_id?: string | null } | null; error: unknown }>,
  parentKey: "package_id" | "library_item_id" | "modal_job_id",
) {
  const { data, error } = await query;
  if (error) throw new Error("FIXTURE_RECOVERY_LOOKUP_FAILED");
  if (!data) return null;
  return { id: data.id, userId: data.user_id, parentId: data[parentKey] ?? "" };
}

async function exactFixtureDelete(query: PromiseLike<{ error: unknown }>, code: string) {
  const { error } = await query;
  if (error) throw new Error(code);
}

function fixtureRegistryPaths(value: unknown) {
  if (!Array.isArray(value) || value.some((path) => typeof path !== "string" || !path)) return [];
  return [...new Set(value)];
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
  const registry = await createFixtureRunRegistry(admin, audit.operationId, userId, FIXTURE_SOURCE_JOB_ID);
  let item: { id: string; mascotCode: string } | undefined;
  const assets = new Map<string, PackageAsset>();
  let packageId = "";
  let failedAsExpected = false;
  let result: Record<string, unknown> | undefined;
  let storageCleanup: FixtureStorageCleanupResult | undefined;
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
      await updateFixtureRunRegistry(admin, registry, { item_id: item.id });
      audit.succeed();
    } catch (error) {
      throw audit.fail(error);
    }
    try {
      await publishMascotPackage(await createClient(), userId, item.id, {
        onAssetStored: async (asset, id) => {
          assets.set(asset.storagePath, asset);
          packageId = id;
          await updateFixtureRunRegistry(admin, registry, { package_id: id, storage_paths: [...assets.keys()] });
        },
        afterStage: async (stage, id) => {
          packageId = id;
          await updateFixtureRunRegistry(admin, registry, { package_id: id });
          if (stage === checkpoint) throw new FixtureAbort();
        },
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
    const importCodeId = await fixtureImportCodeId(admin, packageId);
    await updateFixtureRunRegistry(admin, registry, {
      package_id: packageId,
      import_code_id: importCodeId,
      storage_paths: [...assets.keys()],
    });
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
      await markFixtureRunCleanup(admin, registry, "cleaning");
      storageCleanup = await cleanupFixture(admin, item.id, packageId, [...assets.keys()]);
      await markFixtureRunCleanup(admin, registry, "cleaned", storageCleanup);
      await deleteFixtureRunRegistry(admin, registry);
      audit.succeed();
    } catch (error) {
      await markFixtureRunCleanup(admin, registry, "failed", storageCleanup).catch(() => undefined);
      const cleanupFailure = audit.fail(error);
      if (!failure) failure = cleanupFailure;
    }
  } else if (failure) {
    await deleteFixtureRunRegistry(admin, registry).catch(() => undefined);
  }

  if (failure) throw failure;
  if (!item || !result) throw audit.fail(new Error("fixture result"));
  try {
    const cleanup = await fixtureState(admin, userId, item.id, packageId, item.mascotCode);
    const qa = await admin.from("mascot_library_items").select("id", { count: "exact", head: true }).eq("modal_job_id", ATTEMPT_ANCHOR_JOB_ID);
    return {
      ...result,
      counts: {
        ...(result.counts as Record<string, number>),
        postCleanupItems: cleanup.items,
        postCleanupPackages: cleanup.packages,
        postCleanupCodes: cleanup.codes,
        storageObjectsExpected: storageCleanup?.storageObjectsExpected ?? 0,
        storageObjectsRemaining: storageCleanup?.storageObjectsRemaining ?? 0,
        storageCleanupVerified: storageCleanup?.storageCleanupVerified ?? false,
      },
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

async function fixtureImportCodeId(admin: NonNullable<ReturnType<typeof createAdminClient>>, packageId: string) {
  const { data, error } = await admin.from("mascot_import_codes").select("id")
    .eq("package_id", packageId).maybeSingle<{ id: string }>();
  if (error || !data) throw new Error("FIXTURE_IMPORT_CODE_UNAVAILABLE");
  return data.id;
}

async function cleanupFixture(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  itemId: string,
  packageId: string,
  paths: string[],
): Promise<FixtureStorageCleanupResult> {
  const cleanup = await removeAndVerifyFixtureStorage(paths, {
    removeExact: async (exactPaths) => {
      if (!exactPaths.length) return;
      const { error } = await admin.storage.from("mascot-packages").remove([...exactPaths]);
      if (error) throw new FixtureStageError("FIXTURE_CLEANUP", "FIXTURE_STORAGE_REMOVE_FAILED");
    },
    objectExistsExact: async (path) => {
      const { data, error } = await admin.storage.from("mascot-packages").download(path, {}, { cache: "no-store" });
      if (data) return true;
      if (storageObjectWasRemoved(error)) return false;
      throw new FixtureStageError("FIXTURE_CLEANUP", "FIXTURE_STORAGE_VERIFY_FAILED");
    },
  });
  if (!cleanup.storageCleanupVerified) {
    throw new FixtureStageError("FIXTURE_CLEANUP", "FIXTURE_STORAGE_CLEANUP_RESIDUE");
  }
  if (packageId) await admin.from("mascot_import_codes").delete().eq("package_id", packageId);
  if (packageId) await admin.from("mascot_packages").delete().eq("id", packageId);
  await admin.from("mascot_library_items").delete().eq("id", itemId);
  return cleanup;
}

function storageObjectWasRemoved(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  return (error as { status?: unknown }).status === 404;
}

function storageErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

function storageErrorName(error: unknown): "StorageApiError" | "StorageUnknownError" | "Unknown" {
  if (!error || typeof error !== "object" || !("name" in error)) return "Unknown";
  const name = (error as { name?: unknown }).name;
  return name === "StorageApiError" || name === "StorageUnknownError" ? name : "Unknown";
}

function storageErrorMessage(error: unknown) {
  const status = storageErrorStatus(error);
  if (status === 400) return "A consulta de metadados foi recusada pelo Storage.";
  if (status === 401 || status === 403) return "O Storage recusou a autorização da consulta.";
  if (status !== null && status >= 500) return "O Storage falhou ao processar a consulta.";
  return "Falha ao consultar metadados do Storage.";
}
