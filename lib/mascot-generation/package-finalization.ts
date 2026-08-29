import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobIdentity } from "./attempt";
import { markAttemptPackageFailed, markAttemptPackaging, markAttemptReady } from "./attempt-store";
import { reconcileAssetChecks } from "./asset-check-store";
import { saveLibraryItem } from "./library-store";
import { MascotPackageError, publishMascotPackage } from "./package-store";
import { isPoseSetReadyForPackaging, poseSetFailureCode } from "./pose-set-qc";
import { getMascotGenerationProvider } from "./provider";
import type { GenerationJob, MascotLibraryItem } from "./types";

export type PackageFinalizationInput = {
  client: SupabaseClient;
  userId: string;
  attemptId: string;
  jobId: string;
  displayName: string;
};

export async function finalizeMascotPackage(input: PackageFinalizationInput) {
  let packagingStarted = false;
  try {
    const job = await loadPackagableJob(input);
    await verifyPoseAssets(job, input.userId, input.attemptId);
    await reconcileAssetChecks(input.client, input.userId, job);
    packagingStarted = true;
    await markAttemptPackaging(input.client, input.userId, input.attemptId);
    const item = await saveItem(input, job);
    const finalized = await publishMascotPackage(input.client, input.userId, item.id);
    await markAttemptReady(input.client, input.userId, input.attemptId);
    return finalized;
  } catch (error) {
    if (packagingStarted) await markPackagingFailure(input, error);
    throw error;
  }
}

export function assertFinalizationDisplayName(value: string) {
  if (value.trim().length < 2 || value.trim().length > 32) {
    throw new MascotPackageError("DISPLAY_NAME_INVALID", "Informe um nome de 2 a 32 caracteres para o mascote.");
  }
}

export function finalizationFailureMessage(job: GenerationJob | null) {
  const code = job ? poseSetFailureCode(job.poseSetQc) : "POSE_SET_NOT_READY";
  return {
    code,
    message: code === "VISUAL_POSE_CONSISTENCY_FAILED"
      ? "As poses precisam manter o mesmo enquadramento antes de guardar o mascote."
      : "As três poses ainda não estão prontas para guardar.",
  };
}

export function isFinalizationPreconditionError(error: unknown): error is MascotPackageError {
  return error instanceof MascotPackageError && [
    "POSE_SET_NOT_READY",
    "VISUAL_POSE_CONSISTENCY_FAILED",
    "ATTEMPT_MISMATCH",
    "DISPLAY_NAME_INVALID",
  ].includes(error.code);
}

async function loadPackagableJob(input: PackageFinalizationInput) {
  const job = await getMascotGenerationProvider().getJob(input.jobId, jobIdentity(input.userId, input.attemptId));
  if (!job || job.status !== "awaiting_set_approval" || !job.approvedMasterId || !isPoseSetReadyForPackaging(job.poses, job.poseSetQc)) {
    const failure = finalizationFailureMessage(job);
    throw new MascotPackageError(failure.code, failure.message);
  }
  if (job.attemptId !== input.attemptId) {
    throw new MascotPackageError("ATTEMPT_MISMATCH", "Esta tentativa não pertence à sessão atual.");
  }
  return job;
}

async function verifyPoseAssets(job: GenerationJob, userId: string, attemptId: string) {
  const provider = getMascotGenerationProvider();
  await Promise.all(job.poses.map(async (pose) => {
    if (!pose.sha256 || !/^[a-f0-9]{64}$/.test(pose.sha256)) {
      throw new MascotPackageError("POSE_CHECKSUM_MISSING", "Uma pose aprovada não possui checksum válido.");
    }
    const asset = await provider.getPoseImage?.(job.id, pose.role, jobIdentity(userId, attemptId));
    if (!asset || (pose.size !== undefined && pose.size !== asset.bytes.byteLength)) {
      throw new MascotPackageError("POSE_ASSET_MISMATCH", "Uma pose aprovada não corresponde ao derivado salvo.");
    }
    const digest = createHash("sha256").update(asset.bytes).digest("hex");
    if (digest !== pose.sha256) {
      throw new MascotPackageError("POSE_CHECKSUM_MISMATCH", "Uma pose aprovada não corresponde ao derivado salvo.");
    }
  }));
}

async function saveItem(input: PackageFinalizationInput, job: GenerationJob) {
  return saveLibraryItem(input.client, input.userId, {
    displayName: input.displayName,
    jobId: job.id,
    attemptId: job.attemptId,
    masterId: job.approvedMasterId!,
    poses: job.poses.map((pose) => ({ ...pose, imageUrl: "" })),
  });
}

async function markPackagingFailure(input: PackageFinalizationInput, error: unknown) {
  const errorCode = error instanceof MascotPackageError ? error.code : "PACKAGE_FINALIZATION_FAILED";
  await markAttemptPackageFailed(input.client, input.userId, input.attemptId, errorCode).catch(() => undefined);
}

export function presentFinalizedLibraryItem(item: MascotLibraryItem) {
  return {
    ...item,
    poses: item.poses.map((pose) => ({
      ...pose,
      imageUrl: `/api/mascot/library/${encodeURIComponent(item.id)}/pose/${encodeURIComponent(pose.role)}`,
    })),
  };
}
