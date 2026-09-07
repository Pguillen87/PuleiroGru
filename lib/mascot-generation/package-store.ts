import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobIdentity } from "./attempt";
import { findLibraryItem, findLibraryItemByJob, saveLibraryItem, setLibraryItemDisplayName } from "./library-store";
import { getMascotGenerationProvider } from "./provider";
import type { GeneratedPose, GenerationJob, MascotLibraryItem, PoseRole, PoseSetVisualQualityMetrics } from "./types";
import { isPoseSetReadyForPackaging } from "./pose-set-qc";
import { findHatchedPostBirthAttempt } from "./post-birth-route-context";
import { findPostBirthProfile } from "./post-birth-store";

const BUCKET = "mascot-packages";
const PACKAGE_VERSION = "1.0.0";
const MANIFEST_URL_TTL_SECONDS = 300;
const MAX_PACKAGE_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_PACKAGE_ASSET_DIMENSION = 4096;
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
  packageId: string;
  mascotId: string;
  packageVersion: string;
  createdAt: string;
  publishedAt: string;
  displayName: string;
  visibility: "PRIVATE";
  assets: PackageAsset[];
};
export type MascotPackageRow = { id: string; user_id?: string; package_version: string; manifest: unknown; status: PackageStatus };

export class MascotPackageError extends Error {
  constructor(readonly code: string, message: string, readonly status: 400 | 404 | 409 | 503 = packageErrorStatus(code)) { super(message); }
}

export type NormalizedPackageAsset = {
  bytes: Uint8Array;
  sha256: string;
  mimeType: "image/png";
  width: number;
  height: number;
};

/** Explicit recovery operation. `ready` is the only public commit marker. */
export async function publishMascotPackage(
  client: SupabaseClient,
  userId: string,
  itemId: string,
  options: { displayName?: string } = {},
) {
  const admin = createAdminClient();
  if (!admin) throw new MascotPackageError("PACKAGE_STORAGE_UNAVAILABLE", "Armazenamento de pacotes não configurado.");
  const item = await findLibraryItem(client, userId, itemId);
  if (!item) throw new MascotPackageError("MASCOT_NOT_FOUND", "Mascote não encontrado.");
  const existing = await findPackage(admin, userId, item.id);
  const displayName = options.displayName ?? item.displayName;
  if (existing?.status === "ready") {
    if (isReadyManifest(existing.manifest, item, displayName)) return { item, package: existing, idempotentReplay: true };
    throw new MascotPackageError("PACKAGE_DISPLAY_NAME_CONFLICT", "Este pacote já foi publicado com outra identidade.", 409);
  }
  const packageRow = existing ?? await createPendingPackage(admin, userId, item);
  if (packageRow.status === "revoked") throw new MascotPackageError("PACKAGE_REVOKED", "Este pacote foi revogado e não pode ser preparado novamente.");
  const sources = await loadApprovedPoseAssets(userId, item);
  const assets = await storeAssetsExactly(admin, userId, packageRow.id, sources);
  const manifest = createManifest(item, packageRow.id, assets, displayName);
  assertManifest(manifest, userId, packageRow.id);
  await savePendingManifest(admin, userId, packageRow.id, manifest);
  await putManifestObject(admin, userId, packageRow.id, manifest);
  await ensureImportCode(admin, userId, packageRow.id, item.mascotCode);
  return { item, package: await promoteReady(admin, userId, packageRow.id, manifest), idempotentReplay: false };
}

export async function publishPostBirthMascotPackage(client: SupabaseClient, userId: string, jobId: string) {
  const admin = createAdminClient();
  if (!admin) throw new MascotPackageError("PACKAGE_STORAGE_UNAVAILABLE", "Armazenamento de pacotes não configurado.");
  const attempt = await findHatchedPostBirthAttempt(client, userId, jobId);
  if (!attempt) throw new MascotPackageError("POST_BIRTH_PROFILE_NOT_AVAILABLE", "O mascote ainda não está disponível para empacotamento.", 404);
  const profile = await findPostBirthProfile(client, userId, attempt.attempt_id);
  if (!profile) throw new MascotPackageError("POST_BIRTH_PROFILE_NOT_FOUND", "Perfil pós-nascimento não encontrado.", 404);
  if (profile.state !== "ACTIVE") throw new MascotPackageError("POST_BIRTH_PROFILE_NOT_ACTIVE", "Ative o perfil pós-nascimento antes de preparar o pacote.", 409);
  if (!profile.displayName) throw new MascotPackageError("DISPLAY_NAME_REQUIRED", "Defina um nome antes de preparar o pacote.", 400);

  const job = await getMascotGenerationProvider().getJob(jobId, jobIdentity(userId, attempt.attempt_id));
  if (!job || job.attemptId !== attempt.attempt_id) throw new MascotPackageError("PACKAGE_SOURCE_UNAVAILABLE", "Não foi possível confirmar o conjunto aprovado.", 409);
  assertApprovedSet(job.poses, job.poseSetQc);
  if (!job.approvedMasterId) throw new MascotPackageError("PACKAGE_SOURCE_UNAVAILABLE", "Não foi possível confirmar o Master aprovado.", 409);

  const item = await ensurePostBirthLibraryItem(client, userId, profile.displayName, job);
  const result = await publishMascotPackage(client, userId, item.id, { displayName: profile.displayName });
  const signedManifest = await createSignedManifestUrl(admin, userId, result.package);
  return { ...result, ...signedManifest };
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
      typeof manifest.createdAt !== "string" || typeof manifest.publishedAt !== "string" ||
      typeof manifest.displayName !== "string" || !Array.isArray(manifest.assets)) return null;
  try { assertManifest(manifest as MascotPackageManifest); return manifest as MascotPackageManifest; } catch { return null; }
}

export async function normalizePackageAsset(bytes: Uint8Array, declaredMime: string): Promise<NormalizedPackageAsset> {
  normalizeImageMime(declaredMime);
  try {
    const sourceMetadata = await sharp(bytes, { failOn: "error" }).metadata();
    const detectedMime = formatToMime(sourceMetadata.format);
    if (detectedMime !== declaredMime || !sourceMetadata.width || !sourceMetadata.height) {
      throw new MascotPackageError("ASSET_MIME_INVALID", "A pose aprovada possui um formato incompatível.", 409);
    }
    if (sourceMetadata.width > MAX_PACKAGE_ASSET_DIMENSION || sourceMetadata.height > MAX_PACKAGE_ASSET_DIMENSION) {
      throw new MascotPackageError("ASSET_DIMENSIONS_INVALID", "A pose aprovada excede as dimensões permitidas.", 409);
    }
    const normalized = await sharp(bytes, { failOn: "error" }).rotate().png({ compressionLevel: 9 }).toBuffer();
    if (normalized.byteLength === 0 || normalized.byteLength > MAX_PACKAGE_ASSET_BYTES) {
      throw new MascotPackageError("ASSET_SIZE_INVALID", "A pose aprovada excede o tamanho permitido.", 409);
    }
    const metadata = await sharp(normalized, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height || metadata.width > MAX_PACKAGE_ASSET_DIMENSION || metadata.height > MAX_PACKAGE_ASSET_DIMENSION) {
      throw new MascotPackageError("ASSET_DIMENSIONS_INVALID", "A pose aprovada possui dimensões inválidas.", 409);
    }
    return { bytes: new Uint8Array(normalized), sha256: sha256(normalized), mimeType: "image/png", width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof MascotPackageError) throw error;
    throw new MascotPackageError("ASSET_INVALID", "Não foi possível normalizar a pose aprovada.", 409);
  }
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
    if (!source) throw new MascotPackageError("ASSET_MISSING", `A pose ${role} não está disponível.`, 409);
    const bytes = new Uint8Array(source.bytes);
    const hash = sha256(bytes);
    if (hash !== pose.sha256 || (pose.size !== undefined && pose.size !== bytes.byteLength)) {
      throw new MascotPackageError("INVALID_CHECKSUM", `A pose ${role} não corresponde ao derivado aprovado.`, 409);
    }
    return { pose, role, ...(await normalizePackageAsset(bytes, source.contentType)) };
  }));
}

async function storeAssetsExactly(admin: SupabaseClient, userId: string, packageId: string, sources: Awaited<ReturnType<typeof loadApprovedPoseAssets>>): Promise<PackageAsset[]> {
  return Promise.all(sources.map(async (source) => {
    const storagePath = packageAssetPath(userId, packageId, source.role, source.sha256, source.mimeType);
    await putOrVerifyExactBytes(admin, storagePath, source.bytes, source.mimeType, source.sha256);
    return { poseId: source.pose.id, role: source.role.toUpperCase() as Uppercase<PoseRole>, storagePath, sha256: source.sha256,
      expectedBytes: source.bytes.byteLength, mimeType: source.mimeType, width: source.width, height: source.height };
  }));
}

async function putOrVerifyExactBytes(admin: SupabaseClient, storagePath: string, bytes: Uint8Array, mimeType: string, expectedHash: string) {
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

async function putManifestObject(admin: SupabaseClient, userId: string, packageId: string, manifest: MascotPackageManifest) {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  await putOrVerifyExactBytes(admin, manifestStoragePath(userId, packageId), bytes, "application/json", sha256(bytes));
}

export async function createSignedManifestUrl(admin: SupabaseClient, userId: string, packageRow: MascotPackageRow) {
  const manifest = parseReadyManifest(packageRow.manifest);
  if (!manifest) throw new MascotPackageError("MANIFEST_INVALID", "O manifesto do pacote é inválido.", 409);
  await putManifestObject(admin, userId, packageRow.id, manifest);
  const signed = await admin.storage.from(BUCKET).createSignedUrl(manifestStoragePath(userId, packageRow.id), MANIFEST_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) throw new MascotPackageError("MANIFEST_SIGNING_FAILED", "Não foi possível assinar o manifesto agora.");
  return { manifestUrl: signed.data.signedUrl, manifestExpiresIn: MANIFEST_URL_TTL_SECONDS };
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

function createDraftManifest(item: MascotLibraryItem) {
  return { schemaVersion: 1 as const, assetPipelineVersion: 3 as const, mascotId: item.id, packageVersion: PACKAGE_VERSION, displayName: item.displayName, visibility: "PRIVATE" as const, assets: [] };
}
function createManifest(item: MascotLibraryItem, packageId: string, assets: PackageAsset[], displayName: string): MascotPackageManifest {
  const timestamp = new Date().toISOString();
  return { ...createDraftManifest(item), packageId, createdAt: timestamp, publishedAt: timestamp, displayName, assets };
}
function isReadyManifest(value: unknown, item: MascotLibraryItem, displayName: string) {
  const manifest = parseReadyManifest(value);
  return manifest?.mascotId === item.id && manifest.displayName === displayName;
}
function assertApprovedSet(poses: GeneratedPose[], poseSetQc?: PoseSetVisualQualityMetrics) {
  if (poseSetQc?.version !== "pose-set-visual-v3") throw new MascotPackageError("POSE_QC_INVALID", "O conjunto aprovado não passou pelo QC v3.", 409);
  if (!isPoseSetReadyForPackaging(poses, poseSetQc)) {
    if (poseSetQc?.status !== "failed") throw new MascotPackageError("POSE_SET_NOT_READY", "As três poses aprovadas ainda não estão disponíveis.");
    throw new MascotPackageError("VISUAL_POSE_CONSISTENCY_FAILED", "As poses precisam manter o mesmo enquadramento antes de formar o pacote.");
  }
}
function assertManifest(manifest: MascotPackageManifest, userId?: string, packageId?: string) {
  if (manifest.schemaVersion !== 1 || manifest.assetPipelineVersion !== 3 || manifest.visibility !== "PRIVATE" || !manifest.packageId || (packageId && manifest.packageId !== packageId) || !manifest.mascotId || !manifest.packageVersion || !manifest.displayName || !isTimestamp(manifest.createdAt) || !isTimestamp(manifest.publishedAt) || manifest.assets.length !== ROLES.length) throw new MascotPackageError("MANIFEST_INVALID", "O manifesto do pacote é inválido.", 409);
  const expectedRoles = new Set(ROLES.map((role) => role.toUpperCase()));
  const seenRoles = new Set<string>();
  for (const asset of manifest.assets) {
    if (!expectedRoles.has(asset.role) || seenRoles.has(asset.role) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.expectedBytes) || asset.expectedBytes < 1 || !Number.isInteger(asset.width) || asset.width < 1 || !Number.isInteger(asset.height) || asset.height < 1 || !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) throw new MascotPackageError("MANIFEST_INVALID", "O manifesto do pacote é inválido.", 409);
    if (userId && packageId && !asset.storagePath.startsWith(`v1/${userId}/${packageId}/${asset.role.toLowerCase()}/`)) throw new MascotPackageError("MANIFEST_PATH_INVALID", "O manifesto contém um caminho inesperado.");
    seenRoles.add(asset.role);
  }
  if (seenRoles.size !== expectedRoles.size) throw new MascotPackageError("MANIFEST_INVALID", "O manifesto do pacote é inválido.", 409);
}
function packageAssetPath(userId: string, packageId: string, role: PoseRole, hash: string, mimeType: string) { return `v1/${userId}/${packageId}/${role}/${hash}.${mimeType.split("/")[1]}`; }
function manifestStoragePath(userId: string, packageId: string) { return `v1/${userId}/${packageId}/manifest.json`; }
function normalizeImageMime(value: string): PackageAsset["mimeType"] {
  if (value === "image/png" || value === "image/jpeg" || value === "image/webp") return value;
  throw new MascotPackageError("ASSET_MIME_INVALID", "A pose aprovada possui um tipo de arquivo incompatível.", 409);
}
function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function hashCode(code: string) { return sha256(Buffer.from(code.trim().toUpperCase(), "utf8")); }

function formatToMime(format?: string) {
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return undefined;
}

function isTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function packageErrorStatus(code: string): 400 | 404 | 409 | 503 {
  if (code === "DISPLAY_NAME_REQUIRED") return 400;
  if (code === "POST_BIRTH_PROFILE_NOT_AVAILABLE" || code === "POST_BIRTH_PROFILE_NOT_FOUND" || code === "MASCOT_NOT_FOUND") return 404;
  if (code === "POST_BIRTH_PROFILE_NOT_ACTIVE" || code === "INVALID_CHECKSUM" || code === "ASSET_MISSING" || code === "MANIFEST_INVALID" || code === "PACKAGE_DISPLAY_NAME_CONFLICT") return 409;
  return 503;
}

async function ensurePostBirthLibraryItem(client: SupabaseClient, userId: string, displayName: string, job: GenerationJob) {
  const current = await findLibraryItemByJob(client, userId, job.id);
  if (!current) {
    return saveLibraryItem(client, userId, {
      displayName,
      jobId: job.id,
      attemptId: job.attemptId,
      masterId: job.approvedMasterId!,
      poses: job.poses.map((pose) => ({ ...pose, imageUrl: "" })),
    });
  }
  if (current.displayName === displayName) return current;
  const renamed = await setLibraryItemDisplayName(client, userId, current.id, displayName);
  if (!renamed) throw new MascotPackageError("MASCOT_NOT_FOUND", "Mascote não encontrado.", 404);
  return renamed;
}
