import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedPose, MascotGenerationProvider, PoseRole, PoseSetVisualQualityMetrics } from "./types";
import type { JobIdentity } from "./types";

const BUCKET = "mascot-approved-assets";
const ROLES: PoseRole[] = ["normal", "listening", "transcribing"];
const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type PoseSetRow = {
  id: string;
  user_id: string;
  attempt_id: string;
  modal_job_id: string;
  master_id: string;
  pose_set_qc: PoseSetVisualQualityMetrics;
  status: "PENDING" | "READY" | "FAILED";
};

type PoseAssetRow = {
  pose_set_id: string;
  user_id: string;
  role: PoseRole;
  storage_path: string;
  sha256: string;
  expected_bytes: number;
  mime_type: string;
  width: number;
  height: number;
  qc: unknown;
};

export type ApprovedPoseAsset = {
  role: PoseRole;
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
  expectedBytes: number;
  width: number;
  height: number;
  qc: unknown;
};

export class ApprovedPoseStoreError extends Error {
  readonly status: 409 | 503;

  constructor(readonly code: "APPROVED_POSE_SET_UNAVAILABLE" | "APPROVED_POSE_SET_INVALID", message: string) {
    super(message);
    this.name = "ApprovedPoseStoreError";
    this.status = code === "APPROVED_POSE_SET_INVALID" ? 409 : 503;
  }
}

export async function persistApprovedPoseSet(
  admin: SupabaseClient,
  provider: MascotGenerationProvider,
  userId: string,
  attemptId: string,
  jobId: string,
  masterId: string,
  poseSetQc: PoseSetVisualQualityMetrics,
  poses: GeneratedPose[],
  identity: JobIdentity,
) {
  const existing = await findPoseSet(admin, userId, attemptId);
  if (existing?.status === "READY") {
    const assets = await readApprovedPoseAssets(admin, userId, attemptId);
    if (assets?.length === ROLES.length) return { id: existing.id, assets, idempotentReplay: true };
  }
  const set = existing ?? await createPoseSet(admin, userId, attemptId, jobId, masterId, poseSetQc);
  if (set.status === "FAILED") {
    const { data, error } = await admin.from("mascot_approved_pose_sets")
      .update({ status: "PENDING", ready_at: null, modal_job_id: jobId, master_id: masterId, pose_set_qc: poseSetQc })
      .eq("id", set.id).eq("user_id", userId).select("*").single<PoseSetRow>();
    if (error || !data) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", "Não foi possível reabrir a persistência dos assets aprovados.");
  }
  try {
    const assets = await Promise.all(ROLES.map((role) => persistRole(admin, provider, set.id, userId, jobId, role, poses, identity)));
    const { error } = await admin.from("mascot_approved_pose_sets").update({ status: "READY", ready_at: new Date().toISOString() })
      .eq("id", set.id).eq("user_id", userId).eq("status", "PENDING");
    if (error) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", "Não foi possível confirmar os assets aprovados.");
    return { id: set.id, assets, idempotentReplay: false };
  } catch (error) {
    await admin.from("mascot_approved_pose_sets").update({ status: "FAILED" }).eq("id", set.id).eq("user_id", userId);
    if (error instanceof ApprovedPoseStoreError) throw error;
    throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", "Não foi possível guardar os assets aprovados.");
  }
}

export async function readApprovedPoseAssets(admin: SupabaseClient, userId: string, attemptId: string): Promise<ApprovedPoseAsset[] | null> {
  const set = await findPoseSet(admin, userId, attemptId);
  if (!set || set.status !== "READY") return null;
  const { data, error } = await admin.from("mascot_approved_pose_assets").select("*")
    .eq("pose_set_id", set.id).eq("user_id", userId).order("role").returns<PoseAssetRow[]>();
  if (error || !data || data.length !== ROLES.length) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", "Os assets aprovados não estão disponíveis.");
  const assets = await Promise.all(data.map(async (row) => {
    if (!ROLES.includes(row.role) || !MIME_TYPES.has(row.mime_type)) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_INVALID", "O conjunto aprovado possui metadados inválidos.");
    const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(row.storage_path);
    if (downloadError || !blob) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", "Um asset aprovado não pôde ser lido.");
    const bytes = new Uint8Array(await blob.arrayBuffer()) as Uint8Array<ArrayBufferLike>;
    if (bytes.byteLength !== row.expected_bytes || sha256(bytes) !== row.sha256) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_INVALID", "A integridade de um asset aprovado não confere.");
    return { role: row.role, bytes, mimeType: row.mime_type as ApprovedPoseAsset["mimeType"], sha256: row.sha256, expectedBytes: row.expected_bytes, width: row.width, height: row.height, qc: row.qc };
  }));
  return ROLES.map((role) => {
    const asset = assets.find((entry) => entry.role === role);
    if (!asset) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_INVALID", "O conjunto aprovado não possui as três roles.");
    return asset;
  });
}

async function findPoseSet(admin: SupabaseClient, userId: string, attemptId: string) {
  const { data, error } = await admin.from("mascot_approved_pose_sets").select("*")
    .eq("user_id", userId).eq("attempt_id", attemptId).maybeSingle<PoseSetRow>();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return null;
    throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", "Não foi possível verificar os assets aprovados.");
  }
  return data;
}

async function createPoseSet(admin: SupabaseClient, userId: string, attemptId: string, jobId: string, masterId: string, poseSetQc: PoseSetVisualQualityMetrics) {
  const { data, error } = await admin.from("mascot_approved_pose_sets").insert({
    user_id: userId, attempt_id: attemptId, modal_job_id: jobId, master_id: masterId, pose_set_qc: poseSetQc, status: "PENDING",
  }).select("*").single<PoseSetRow>();
  if (!error && data) return data;
  if (error?.code === "23505") {
    const replay = await findPoseSet(admin, userId, attemptId);
    if (replay) return replay;
  }
  throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", "Não foi possível iniciar a persistência dos assets aprovados.");
}

async function persistRole(admin: SupabaseClient, provider: MascotGenerationProvider, setId: string, userId: string, jobId: string, role: PoseRole, poses: GeneratedPose[], identity: JobIdentity) {
  const pose = poses.find((entry) => entry.role === role);
  if (!pose || !provider.getPoseImage) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_INVALID", `A pose ${role} não está disponível.`);
  const source = await provider.getPoseImage(jobId, role, identity);
  if (!source || !MIME_TYPES.has(source.contentType)) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_INVALID", `A pose ${role} possui um formato inválido.`);
  const bytes = new Uint8Array(source.bytes) as Uint8Array<ArrayBufferLike>;
  const hash = sha256(bytes);
  if ((pose.sha256 && pose.sha256 !== hash) || (pose.size && pose.size !== bytes.byteLength)) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_INVALID", `A integridade da pose ${role} não confere.`);
  const width = pose.qc?.width ?? 0;
  const height = pose.qc?.height ?? 0;
  if (width <= 0 || height <= 0) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_INVALID", `As dimensões da pose ${role} não foram confirmadas pelo QC.`);
  const path = `approved/${userId}/${setId}/${role}/${hash}.${source.contentType.split("/")[1]}`;
  const upload = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: source.contentType, upsert: true });
  if (upload.error) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", `Não foi possível guardar a pose ${role}.`);
  const { error } = await admin.from("mascot_approved_pose_assets").upsert({
    pose_set_id: setId, user_id: userId, role, storage_path: path, sha256: hash,
    expected_bytes: bytes.byteLength, mime_type: source.contentType, width, height, qc: pose.qc ?? {},
  }, { onConflict: "pose_set_id,role" });
  if (error) throw new ApprovedPoseStoreError("APPROVED_POSE_SET_UNAVAILABLE", `Não foi possível registrar a pose ${role}.`);
  return { role, bytes, mimeType: source.contentType as ApprovedPoseAsset["mimeType"], sha256: hash, expectedBytes: bytes.byteLength, width, height, qc: pose.qc ?? {} };
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
