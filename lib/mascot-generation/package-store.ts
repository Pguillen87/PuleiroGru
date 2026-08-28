import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobIdentity } from "./attempt";
import { findLibraryItem } from "./library-store";
import { getMascotGenerationProvider } from "./provider";
import type { GeneratedPose, MascotLibraryItem, PoseRole, PoseSetVisualQualityMetrics } from "./types";
import { isPoseSetReadyForPackaging } from "./pose-set-qc";

const BUCKET = "mascot-packages";
const PACKAGE_VERSION = "1.0.0";
const ROLES: readonly PoseRole[] = ["normal", "listening", "transcribing"];

export type PackageStatus = "pending" | "ready" | "revoked";
export type PackageAsset = {
  poseId: string;
  role: Uppercase<PoseRole>;
  storagePath: string;
  sha256: string;
  expectedBytes: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
};
export type MascotPackageManifest = {
  schemaVersion: 1;
  assetPipelineVersion: 3;
  mascotId: string;
  packageVersion: string;
  displayName: string;
  visibility: "PRIVATE";
  assets: PackageAsset[];
};
export type MascotPackageRow = { id: string; user_id?: string; package_version: string; manifest: unknown; status: PackageStatus };

export class MascotPackageError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** Explicit recovery operation. `ready` is the only public commit marker. */
export async function publishMascotPackage(client: SupabaseClient, userId: string, itemId: string) {
  const admin = createAdminClient();
  if (!admin) throw new MascotPackageError("PACKAGE_STORAGE_UNAVAILABLE", "Armazenamento de pacotes não configurado.");
  const item = await findLibraryItem(client, userId, itemId);
  if (!item) throw new MascotPackageError("MASCOT_NOT_FOUND", "Mascote não encontrado.");
  const existing = await findPackage(admin, userId, item.id);
  if (existing?.status === "ready" && isReadyManifest(existing.manifest, item)) return { item, package: existing };
  const packageRow = existing ?? await createPendingPackage(admin, userId, item);
  if (packageRow.status === "revoked") throw new MascotPackageError("PACKAGE_REVOKED", "Este pacote foi revogado e não pode ser preparado novamente.");
  const sources = await loadApprovedPoseAssets(userId, item);
  const assets = await storeAssetsExactly(admin, userId, packageRow.id, sources);
  const manifest = createManifest(item, assets);
  assertManifest(manifest, userId, packageRow.id);
  await savePendingManifest(admin, userId, packageRow.id, manifest);
  await ensureImportCode(admin, userId, packageRow.id, item.mascotCode);
  return { item, package: await promoteReady(admin, userId, packageRow.id, manifest) };
}

/** Published manifests are immutable; a future revision requires an explicit Android contract. */
export async function refreshPackageDisplayName(userId: string, itemId: string, displayName: string) {
  void userId;
  void itemId;
  void displayName;
}

export async function resolveMascotImportCode(admin: SupabaseClient, code: string) {
  const { data: codeRow, error } = await admin.from("mascot_import_codes")
    .select("package_id, expires_at, revoked_at").eq("code_hash", hashCode(code))
    .maybeSingle<{ package_id: string; expires_at: string | null; revoked_at: string | null }>();
  if (error || !codeRow || codeRow.revoked_at || (codeRow.expires_at && new Date(codeRow.expires_at) <= new Date())) return null;
  const { data } = await admin.from("mascot_packages").select("id, user_id, package_version, manifest, status")
    .eq("id", codeRow.package_id).eq("status", "ready").maybeSingle<MascotPackageRow>();
  return data ?? null;
}

export function parseReadyManifest(value: unknown): MascotPackageManifest | null {
  if (!value || typeof value !== "object") return null;
  const manifest = value as Partial<MascotPackageManifest>;
  if (manifest.schemaVersion !== 1 || manifest.assetPipelineVersion !== 3 || manifest.visibility !== "PRIVATE" ||
      typeof manifest.mascotId !== "string" || typeof manifest.packageVersion !== "string" ||
      typeof manifest.displayName !== "string" || !Array.isArray(manifest.assets)) return null;
  try { assertManifest(manifest as MascotPackageManifest); return manifest as MascotPackageManifest; } catch { return null; }
}

async function findPackage(admin: SupabaseClient, userId: string, itemId: string) {
  const { data, error } = await admin.from("mascot_packages").select("id, package_version, manifest, status")
    .eq("user_id", userId).eq("library_item_id", itemId).maybeSingle<MascotPackageRow>();
  if (error) throw new MascotPackageError("PACKAGE_LOOKUP_FAILED", "Não foi possível verificar o pacote.");
  return data;
}

async function createPendingPackage(admin: SupabaseClient, userId: string, item: MascotLibraryItem) {
  const { data, error } = await admin.from("mascot_packages").insert({
    library_item_id: item.id, user_id: userId, package_version: PACKAGE_VERSION, manifest: createDraftManifest(item), status: "pending",
  }).select("id, package_version, manifest, status").single<MascotPackageRow>();
  if (!error && data) return data;
  if (error?.code === "23505") {
    const replay = await findPackage(admin, userId, item.id);
    if (replay) return replay;
  }
  throw new MascotPackageError("PACKAGE_REGISTRATION_FAILED", "Não foi possível iniciar a finalização do pacote.");
}

async function loadApprovedPoseAssets(userId: string, item: MascotLibraryItem) {
  const provider = getMascotGenerationProvider();
  const identity = jobIdentity(userId, item.attemptId);
  const job = await provider.getJob(item.jobId, identity);
  if (!job || job.approvedMasterId !== item.masterId) throw new MascotPackageError("PACKAGE_SOURCE_UNAVAILABLE", "Não foi possível confirmar o conjunto aprovado.");
  assertApprovedSet(job.poses, job.poseSetQc);
  return Promise.all(ROLES.map(async (role) => {
    const pose = job.poses.find((entry) => entry.role === role)!;
    const source = await provider.getPoseImage?.(item.jobId, role, identity);
    if (!source) throw new MascotPackageError("POSE_ASSET_NOT_FOUND", `A pose ${role} não está disponível.`);
    const bytes = new Uint8Array(source.bytes);
    const hash = sha256(bytes);
    if (hash !== pose.sha256 || (pose.size !== undefined && pose.size !== bytes.byteLength)) {
      throw new MascotPackageError("POSE_CHECKSUM_MISMATCH", `A pose ${role} não corresponde ao derivado aprovado.`);
    }
    const metadata = await sharp(bytes).metadata();
    const mimeType = normalizeImageMime(source.contentType);
    if (!metadata.width || !metadata.height) throw new MascotPackageError("POSE_DIMENSIONS_INVALID", `A pose ${role} não possui dimensões válidas.`);
    return { pose, role, bytes, hash, mimeType, width: metadata.width, height: metadata.height };
  }));
}

async function storeAssetsExactly(admin: SupabaseClient, userId: string, packageId: string, sources: Awaited<ReturnType<typeof loadApprovedPoseAssets>>): Promise<PackageAsset[]> {
  return Promise.all(sources.map(async (source) => {
    const storagePath = packageAssetPath(userId, packageId, source.role, source.hash, source.mimeType);
    await putOrVerifyExactBytes(admin, storagePath, source.bytes, source.mimeType, source.hash);
    return { poseId: source.pose.id, role: source.role.toUpperCase() as Uppercase<PoseRole>, storagePath, sha256: source.hash,
      expectedBytes: source.bytes.byteLength, mimeType: source.mimeType, width: source.width, height: source.height };
  }));
}

async function putOrVerifyExactBytes(admin: SupabaseClient, storagePath: string, bytes: Uint8Array, mimeType: PackageAsset["mimeType"], expectedHash: string) {
  const existing = await readObject(admin, storagePath);
  if (existing) {
    if (sha256(existing) !== expectedHash || existing.byteLength !== bytes.byteLength) throw new MascotPackageError("PACKAGE_ASSET_CONFLICT", "Um asset existente não corresponde ao conjunto aprovado.");
    return;
  }
  const upload = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (upload.error) {
    const raced = await readObject(admin, storagePath);
    if (raced && sha256(raced) === expectedHash && raced.byteLength === bytes.byteLength) return;
    throw new MascotPackageError("PACKAGE_ASSET_UPLOAD_FAILED", "Não foi possível guardar um asset privado.");
  }
  const stored = await readObject(admin, storagePath);
  if (!stored || sha256(stored) !== expectedHash || stored.byteLength !== bytes.byteLength) throw new MascotPackageError("PACKAGE_ASSET_VERIFY_FAILED", "Não foi possível verificar o asset armazenado.");
}

async function readObject(admin: SupabaseClient, storagePath: string) {
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function savePendingManifest(admin: SupabaseClient, userId: string, packageId: string, manifest: MascotPackageManifest) {
  const { error } = await admin.from("mascot_packages").update({ package_version: manifest.packageVersion, manifest, status: "pending" })
    .eq("id", packageId).eq("user_id", userId).eq("status", "pending");
  if (error) throw new MascotPackageError("MANIFEST_PERSISTENCE_FAILED", "Não foi possível registrar o manifesto do pacote.");
}

async function ensureImportCode(admin: SupabaseClient, userId: string, packageId: string, mascotCode: string) {
  const { data: current, error: lookupError } = await admin.from("mascot_import_codes").select("package_id")
    .eq("package_id", packageId).maybeSingle<{ package_id: string }>();
  if (lookupError) throw new MascotPackageError("IMPORT_CODE_LOOKUP_FAILED", "Não foi possível verificar o código de entrega.");
  if (current) return;
  const { error } = await admin.from("mascot_import_codes").insert({ package_id: packageId, user_id: userId, code_hash: hashCode(mascotCode) });
  if (!error) return;
  if (error.code === "23505") {
    const { data: replay } = await admin.from("mascot_import_codes").select("package_id").eq("code_hash", hashCode(mascotCode)).maybeSingle<{ package_id: string }>();
    if (replay?.package_id === packageId) return;
  }
  throw new MascotPackageError("IMPORT_CODE_REGISTRATION_FAILED", "Não foi possível registrar o código de entrega.");
}

async function promoteReady(admin: SupabaseClient, userId: string, packageId: string, manifest: MascotPackageManifest) {
  const { data, error } = await admin.from("mascot_packages").update({ manifest, status: "ready" })
    .eq("id", packageId).eq("user_id", userId).eq("status", "pending").select("id, package_version, manifest, status").maybeSingle<MascotPackageRow>();
  if (data) return data;
  if (error) throw new MascotPackageError("PACKAGE_PROMOTION_FAILED", "Não foi possível promover o pacote completo.");
  const replay = await admin.from("mascot_packages").select("id, package_version, manifest, status")
    .eq("id", packageId).eq("user_id", userId).eq("status", "ready").maybeSingle<MascotPackageRow>();
  if (replay.data && parseReadyManifest(replay.data.manifest)) return replay.data;
  throw new MascotPackageError("PACKAGE_PROMOTION_FAILED", "Não foi possível promover o pacote completo.");
}

function createDraftManifest(item: MascotLibraryItem): MascotPackageManifest {
  return { schemaVersion: 1, assetPipelineVersion: 3, mascotId: item.id, packageVersion: PACKAGE_VERSION, displayName: item.displayName, visibility: "PRIVATE", assets: [] };
}
function createManifest(item: MascotLibraryItem, assets: PackageAsset[]): MascotPackageManifest { return { ...createDraftManifest(item), assets }; }
function isReadyManifest(value: unknown, item: MascotLibraryItem) {
  const manifest = parseReadyManifest(value);
  return manifest?.mascotId === item.id;
}
function assertApprovedSet(poses: GeneratedPose[], poseSetQc?: PoseSetVisualQualityMetrics) {
  if (!isPoseSetReadyForPackaging(poses, poseSetQc)) {
    if (poseSetQc?.status !== "failed") throw new MascotPackageError("POSE_SET_NOT_READY", "As três poses aprovadas ainda não estão disponíveis.");
    throw new MascotPackageError("VISUAL_POSE_CONSISTENCY_FAILED", "As poses precisam manter o mesmo enquadramento antes de formar o pacote.");
  }
}
function assertManifest(manifest: MascotPackageManifest, userId?: string, packageId?: string) {
  if (manifest.schemaVersion !== 1 || manifest.assetPipelineVersion !== 3 || manifest.visibility !== "PRIVATE" || !manifest.mascotId || !manifest.displayName || manifest.assets.length !== ROLES.length) throw new MascotPackageError("MANIFEST_INVALID", "O manifesto do pacote é inválido.");
  const expectedRoles = new Set(ROLES.map((role) => role.toUpperCase()));
  const seenRoles = new Set<string>();
  for (const asset of manifest.assets) {
    if (!expectedRoles.has(asset.role) || seenRoles.has(asset.role) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.expectedBytes) || asset.expectedBytes < 1 || !Number.isInteger(asset.width) || asset.width < 1 || !Number.isInteger(asset.height) || asset.height < 1 || !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) throw new MascotPackageError("MANIFEST_INVALID", "O manifesto do pacote é inválido.");
    if (userId && packageId && !asset.storagePath.startsWith(`v1/${userId}/${packageId}/${asset.role.toLowerCase()}/`)) throw new MascotPackageError("MANIFEST_PATH_INVALID", "O manifesto contém um caminho inesperado.");
    seenRoles.add(asset.role);
  }
  if (seenRoles.size !== expectedRoles.size) throw new MascotPackageError("MANIFEST_INVALID", "O manifesto do pacote é inválido.");
}
function packageAssetPath(userId: string, packageId: string, role: PoseRole, hash: string, mimeType: PackageAsset["mimeType"]) { return `v1/${userId}/${packageId}/${role}/${hash}.${mimeType.split("/")[1]}`; }
function normalizeImageMime(value: string): PackageAsset["mimeType"] {
  if (value === "image/png" || value === "image/jpeg" || value === "image/webp") return value;
  throw new MascotPackageError("POSE_MIME_INVALID", "A pose aprovada possui um tipo de arquivo incompatível.");
}
function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function hashCode(code: string) { return sha256(Buffer.from(code.trim().toUpperCase(), "utf8")); }
