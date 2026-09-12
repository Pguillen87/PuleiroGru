import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobIdentity } from "./attempt";
import { findLibraryItem, findLibraryItemByPublicSource } from "./library-store";
import { normalizePackageAsset, parseReadyManifest } from "./package-store";
import { findPublicMascot } from "./community-store";
import { getMascotGenerationProvider } from "./provider";
import type { GeneratedPose, MascotLibraryItem, PoseRole } from "./types";

const BUCKET = "mascot-library-copies";
const ROLES: readonly PoseRole[] = ["normal", "listening", "transcribing"];
const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type PublicMascotCopyResult = {
  item: MascotLibraryItem;
  sourcePublicMascotId: string;
  idempotentReplay: boolean;
};

export class MascotCopyError extends Error {
  constructor(
    readonly code: "PUBLIC_MASCOT_NOT_FOUND" | "PUBLIC_MASCOT_COPY_INVALID" | "PUBLIC_MASCOT_COPY_CONFLICT" | "PUBLIC_MASCOT_COPY_UNAVAILABLE",
    message: string,
    readonly status: 400 | 404 | 409 | 503 = copyErrorStatus(code),
  ) {
    super(message);
    this.name = "MascotCopyError";
  }
}

export async function createPublicMascotCopy(
  admin: SupabaseClient,
  userId: string,
  publicMascotId: string,
  requestedDisplayName?: string,
): Promise<PublicMascotCopyResult> {
  if (!VALID_ID.test(publicMascotId)) throw new MascotCopyError("PUBLIC_MASCOT_COPY_INVALID", "O mascote público informado é inválido.");
  const existing = await findLibraryItemByPublicSource(admin, userId, publicMascotId);
  if (existing) return { item: existing, sourcePublicMascotId: publicMascotId, idempotentReplay: true };

  const publicMascot = await readPublicMascot(admin, publicMascotId);
  if (!publicMascot) throw new MascotCopyError("PUBLIC_MASCOT_NOT_FOUND", "Este mascote não está mais disponível para cópia.", 404);
  assertPublicPoseSnapshot(publicMascot.pose_snapshot);
  const source = await findSourceItem(admin, publicMascot.published_by, publicMascot.source_item_id);
  if (!source || source.origin === "public_copy") throw new MascotCopyError("PUBLIC_MASCOT_NOT_FOUND", "A origem deste mascote não está disponível.", 404);

  const displayName = normalizeCopyName(requestedDisplayName ?? `Mascote ${publicMascot.mascot_code}`);
  const copyId = randomUUID();
  const assets = await loadSourceAssets(admin, source);
  const uploadedPaths: string[] = [];
  let transactionCommitted = false;

  try {
    for (const asset of assets) {
      const path = copyAssetPath(userId, copyId, asset.role, asset.sha256);
      uploadedPaths.push(path);
      await uploadAndVerify(admin, path, asset.bytes, asset.mimeType, asset.sha256);
    }
    const { data, error } = await admin.rpc("create_public_mascot_copy", {
      p_user_id: userId,
      p_source_public_mascot_id: publicMascotId,
      p_copy_id: copyId,
      p_display_name: displayName,
      p_mascot_code: createCopyCode(),
      p_pose_snapshot: source.poses.map((pose) => ({ ...pose, imageUrl: "" })),
      p_provenance: {
        policyVersion: "public-copy-v1",
        sourcePublicMascotId: publicMascotId,
        sourceMascotCode: publicMascot.mascot_code,
        sourcePublishedBy: publicMascot.published_by,
        sourcePublishedAt: publicMascot.published_at,
      },
      p_assets: assets.map((asset) => ({
        role: asset.role,
        storagePath: copyAssetPath(userId, copyId, asset.role, asset.sha256),
        sha256: asset.sha256,
        expectedBytes: asset.bytes.byteLength,
        mimeType: asset.mimeType,
      })),
    });
    transactionCommitted = !error;
    if (error?.code === "23505") {
      const replayItem = await findLibraryItemByPublicSource(admin, userId, publicMascotId);
      if (replayItem) {
        await removeObjects(admin, uploadedPaths);
        return { item: replayItem, sourcePublicMascotId: publicMascotId, idempotentReplay: true };
      }
      transactionCommitted = false;
    }
    if (error) throw mapRpcError(error);
    const replay = isReplay(data);
    if (replay) {
      await removeObjects(admin, uploadedPaths);
      return { item: await requireCopyItem(admin, userId, publicMascotId), sourcePublicMascotId: publicMascotId, idempotentReplay: true };
    }
    const item = await findLibraryItemByPublicSource(admin, userId, publicMascotId);
    if (!item) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "A cópia não pôde ser confirmada na biblioteca.");
    return { item, sourcePublicMascotId: publicMascotId, idempotentReplay: replay };
  } catch (error) {
    // Once the RPC has returned successfully, the database may already own
    // these paths. Keep them on uncertain reads so a retry can recover the
    // committed copy; orphan cleanup is an explicit operational job.
    if (!transactionCommitted) await removeObjects(admin, uploadedPaths);
    throw normalizeCopyError(error);
  }
}

async function requireCopyItem(admin: SupabaseClient, userId: string, publicMascotId: string) {
  const item = await findLibraryItemByPublicSource(admin, userId, publicMascotId);
  if (!item) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "A cópia não pôde ser confirmada na biblioteca.");
  return item;
}

type SourceAsset = { role: PoseRole; bytes: Uint8Array; sha256: string; mimeType: "image/png" | "image/jpeg" | "image/webp" };

async function readPublicMascot(admin: SupabaseClient, id: string) {
  try { return await findPublicMascot(admin, id); } catch { throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível verificar o mascote público agora."); }
}

async function findSourceItem(admin: SupabaseClient, userId: string, itemId: string): Promise<SourceLibraryItem | null> {
  try {
    const item = await findLibraryItem(admin, userId, itemId);
    return item ? { ...item, sourceUserId: userId } : null;
  } catch { throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível verificar a origem do mascote agora."); }
}

type SourceLibraryItem = MascotLibraryItem & { sourceUserId: string };

async function loadSourceAssets(admin: SupabaseClient, source: SourceLibraryItem): Promise<SourceAsset[]> {
  assertSourcePoseSnapshot(source.poses);
  const packaged = await readPackagedAssets(admin, source);
  if (packaged) return packaged;
  if (!source.jobId || !source.attemptId || !source.masterId) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Os assets autorizados deste mascote não estão disponíveis.", 409);
  const provider = getMascotGenerationProvider();
  const job = await provider.getJob(source.jobId, jobIdentity(source.sourceUserId, source.attemptId));
  if (!job || job.approvedMasterId !== source.masterId) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível confirmar os assets autorizados.", 409);
  return Promise.all(ROLES.map(async (role) => {
    const pose = source.poses.find((entry) => entry.role === role);
    const image = await provider.getPoseImage?.(source.jobId!, role, jobIdentity(source.sourceUserId, source.attemptId!));
    if (!pose || !image) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", `A pose ${role} não está disponível para cópia.`, 409);
    const rawHash = sha256(image.bytes);
    if (!pose.sha256 || rawHash !== pose.sha256 || (pose.size !== undefined && pose.size !== image.bytes.byteLength)) {
      throw new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", `A pose ${role} não corresponde ao registro publicado.`, 409);
    }
    const normalized = await normalizePackageAsset(image.bytes, image.contentType);
    return { role, bytes: normalized.bytes, sha256: normalized.sha256, mimeType: normalized.mimeType };
  }));
}

async function readPackagedAssets(admin: SupabaseClient, source: SourceLibraryItem): Promise<SourceAsset[] | null> {
  const { data, error } = await admin.from("mascot_packages")
    .select("id, manifest, status")
    .eq("user_id", source.sourceUserId)
    .eq("library_item_id", source.id)
    .eq("status", "ready")
    .maybeSingle<{ id: string; manifest: unknown; status: "ready" }>();
  if (error) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível verificar os assets publicados.");
  if (!data) return null;
  const manifest = parseReadyManifest(data.manifest);
  if (!manifest || manifest.mascotId !== source.id) throw new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", "O pacote publicado não passou pela verificação de integridade.", 409);
  return Promise.all(ROLES.map(async (role) => {
    const pose = source.poses.find((entry) => entry.role === role);
    const asset = manifest.assets.find((entry) => entry.role === role.toUpperCase() && entry.poseId === pose?.id);
    if (!pose || !asset || !asset.storagePath.startsWith(`v1/${source.sourceUserId}/${data.id}/`)) throw new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", `A pose ${role} não está íntegra no pacote publicado.`, 409);
    const { data: blob, error: downloadError } = await admin.storage.from("mascot-packages").download(asset.storagePath);
    if (downloadError || !blob) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", `A pose ${role} não está disponível agora.`, 503);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength !== asset.expectedBytes || sha256(bytes) !== asset.sha256) throw new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", `A pose ${role} falhou na verificação de integridade.`, 409);
    return { role, bytes, sha256: asset.sha256, mimeType: asset.mimeType };
  }));
}

async function uploadAndVerify(admin: SupabaseClient, path: string, bytes: Uint8Array, mimeType: string, expectedHash: string) {
  const upload = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mimeType, upsert: false });
  if (upload.error && !isAlreadyExists(upload.error)) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível preparar a cópia agora.");
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível verificar a cópia preparada.");
  const stored = new Uint8Array(await data.arrayBuffer());
  if (stored.byteLength !== bytes.byteLength || sha256(stored) !== expectedHash) throw new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", "Um asset preparado não corresponde à origem.", 409);
}

async function removeObjects(admin: SupabaseClient, paths: string[]) {
  if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => undefined);
}

function assertPublicPoseSnapshot(poses: GeneratedPose[]) {
  if (!hasThreeRoles(poses)) throw new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", "O mascote publicado não possui as três poses autorizadas.", 409);
}

function assertSourcePoseSnapshot(poses: GeneratedPose[]) {
  if (!hasThreeRoles(poses) || ROLES.some((role) => !poses.find((pose) => pose.role === role)?.sha256)) {
    throw new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", "A origem não possui evidências completas de integridade.", 409);
  }
}

function hasThreeRoles(poses: GeneratedPose[]) {
  return poses.length === 3 && new Set(poses.map((pose) => pose.role)).size === 3 && ROLES.every((role) => poses.some((pose) => pose.role === role));
}

function normalizeCopyName(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 32);
  if (normalized.length < 2) throw new MascotCopyError("PUBLIC_MASCOT_COPY_INVALID", "Informe um nome de 2 a 32 caracteres.");
  return normalized;
}

function copyAssetPath(userId: string, copyId: string, role: PoseRole, hash: string) { return `copies/${userId}/${copyId}/${role}/${hash}.png`; }
function createCopyCode() { return `GRU-${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}-${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`; }
function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function isAlreadyExists(error: { statusCode?: string; message?: string }) { return error.statusCode === "409" || error.message?.toLowerCase().includes("already exists") === true; }
function isReplay(value: unknown) { return Boolean(value && typeof value === "object" && (value as { idempotent_replay?: unknown }).idempotent_replay === true); }
function normalizeCopyError(error: unknown) { return error instanceof MascotCopyError ? error : new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível concluir a cópia agora."); }
function mapRpcError(error: { code?: string; message?: string }) {
  if (error.message?.includes("PUBLIC_MASCOT_COPY_IN_PROGRESS")) return new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", "Esta cópia já está sendo preparada. Tente novamente em instantes.", 409);
  if (error.message?.includes("PUBLIC_MASCOT_COPY_INVALID") || error.message?.includes("ASSET_INVALID")) return new MascotCopyError("PUBLIC_MASCOT_COPY_INVALID", "Os dados da cópia não passaram pela validação.");
  if (error.message?.includes("NOT_FOUND") || error.message?.includes("SOURCE_UNAVAILABLE")) return new MascotCopyError("PUBLIC_MASCOT_NOT_FOUND", "Este mascote não está mais disponível para cópia.", 404);
  return new MascotCopyError("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível guardar a cópia agora.");
}
function copyErrorStatus(code: MascotCopyError["code"]): 400 | 404 | 409 | 503 {
  if (code === "PUBLIC_MASCOT_COPY_INVALID") return 400;
  if (code === "PUBLIC_MASCOT_NOT_FOUND") return 404;
  if (code === "PUBLIC_MASCOT_COPY_CONFLICT") return 409;
  return 503;
}
