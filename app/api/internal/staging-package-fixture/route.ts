import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { parseReadyManifest, publishMascotPackage, resolveMascotImportCode, type PackageAsset, type PackageRecoveryStage } from "@/lib/mascot-generation/package-store";

export const runtime = "nodejs";

const SOURCE_JOB_ID = "job_43136e0b5283358281bc1d4c6efa8c01";
const SOURCE_ATTEMPT_ID = `pose-smoke:${SOURCE_JOB_ID}`;
const ORIGINAL_QA_JOB_ID = "job_ad22b714e3547391e9654abf1ece384b";
const checkpoints = new Set<PackageRecoveryStage>(["after_asset_1", "after_assets_3", "after_manifest", "after_code", "before_ready", "after_ready"]);

class FixtureAbort extends Error {}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ code: "FIXTURE_DISABLED" }, { status: 404 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const checkpoint = await requestedCheckpoint(request);
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ code: "SESSION_REQUIRED" }, { status: 401 });
    await requireFixtureOwner();
    return NextResponse.json(await runFixture(identity.uid, checkpoint));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return NextResponse.json({ code: error instanceof FixtureAbort ? "FIXTURE_ABORT_EXPECTED" : "FIXTURE_FAILED" }, { status: 409 });
  }
}

async function requestedCheckpoint(request: Request): Promise<PackageRecoveryStage> {
  const value = (await request.json().catch(() => null) as { checkpoint?: unknown } | null)?.checkpoint;
  if (typeof value !== "string" || !checkpoints.has(value as PackageRecoveryStage)) throw new Error("FIXTURE_CHECKPOINT_INVALID");
  return value as PackageRecoveryStage;
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
  const item = await createFixtureItem(admin, userId, checkpoint);
  const assets = new Map<string, PackageAsset>();
  let packageId = "";
  let failedAsExpected = false;
  let cleaned = false;
  try {
    try {
      await publishMascotPackage(await createClient(), userId, item.id, {
        onAssetStored: (asset, id) => { assets.set(asset.storagePath, asset); packageId = id; },
        afterStage: (stage, id) => { packageId = id; if (stage === checkpoint) throw new FixtureAbort(); },
      });
    } catch (error) {
      if (!(error instanceof FixtureAbort)) throw error;
      failedAsExpected = true;
    }
    const pending = await fixtureState(admin, userId, item.id, packageId, item.mascotCode);
    const replay = await publishMascotPackage(await createClient(), userId, item.id);
    packageId = replay.package.id;
    const manifest = parseReadyManifest(replay.package.manifest);
    if (!manifest) throw new Error("FIXTURE_MANIFEST_INVALID");
    for (const asset of manifest.assets) assets.set(asset.storagePath, asset);
    const ready = await fixtureState(admin, userId, item.id, packageId, item.mascotCode);
    await cleanupFixture(admin, item.id, packageId, [...assets.keys()]);
    cleaned = true;
    const cleanup = await fixtureState(admin, userId, item.id, packageId, item.mascotCode);
    const qa = await admin.from("mascot_library_items").select("id", { count: "exact", head: true }).eq("modal_job_id", ORIGINAL_QA_JOB_ID);
    return {
      checkpoint, failedAsExpected, readyBeforeReplay: pending.packageStatus === "ready", codeResolvedBeforeReady: pending.codeResolved,
      replayReady: ready.packageStatus === "ready", replayCodeResolved: ready.codeResolved,
      counts: { assets: assets.size, postCleanupItems: cleanup.items, postCleanupPackages: cleanup.packages, postCleanupCodes: cleanup.codes },
      qaJobLibraryItems: qa.count ?? 0,
    };
  } finally {
    if (!cleaned) await cleanupFixture(admin, item.id, packageId, [...assets.keys()]);
  }
}

async function createFixtureItem(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string, checkpoint: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const code = `GRU-${[0, 4].map((offset) => Array.from(bytes.subarray(offset, offset + 4), (value) => alphabet[value % alphabet.length]).join("")).join("-")}`;
  const { data, error } = await admin.from("mascot_library_items").insert({
    user_id: userId, attempt_id: SOURCE_ATTEMPT_ID, modal_job_id: SOURCE_JOB_ID, master_id: "master_1",
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
