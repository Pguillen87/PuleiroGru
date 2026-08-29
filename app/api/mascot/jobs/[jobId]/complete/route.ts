import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { markAttemptPackageFailed, markAttemptPackaging, markAttemptReady } from "@/lib/mascot-generation/attempt-store";
import { saveLibraryItem } from "@/lib/mascot-generation/library-store";
import { MascotPackageError, publishMascotPackage } from "@/lib/mascot-generation/package-store";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { GenerationJob } from "@/lib/mascot-generation/types";
import { createClient } from "@/lib/supabase/server";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { reconcileAssetChecks } from "@/lib/mascot-generation/asset-check-store";
import { isPoseSetReadyForPackaging, poseSetFailureCode } from "@/lib/mascot-generation/pose-set-qc";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  let finalization: { userId: string; attemptId: string } | null = null;
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const body = await request.json().catch(() => null) as { displayName?: unknown } | null;
    const displayName = typeof body?.displayName === "string" ? body.displayName : "";
    if (displayName.trim().length < 2 || displayName.trim().length > 32) {
      return NextResponse.json({ message: "Informe um nome de 2 a 32 caracteres para o mascote." }, { status: 400 });
    }
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado." }, { status: 404 });
    if (identity.mode !== "supabase-session") {
      return NextResponse.json({ message: "Entre em sua conta para guardar o mascote.", code: "SESSION_REQUIRED" }, { status: 401 });
    }
    const job = await getMascotGenerationProvider().getJob(jobId, jobIdentity(identity.uid, attemptId));
    if (!job || job.status !== "awaiting_set_approval" || !job.approvedMasterId || !hasCompletePoseSet(job)) {
      const code = job ? poseSetFailureCode(job.poseSetQc) : "POSE_SET_NOT_READY";
      const message = code === "VISUAL_POSE_CONSISTENCY_FAILED"
        ? "As poses precisam manter o mesmo enquadramento antes de guardar o mascote."
        : "As três poses ainda não estão prontas para guardar.";
      return NextResponse.json({ message, code }, { status: 409 });
    }
    await verifyPoseAssets(job, identity.uid, attemptId);
    const supabase = await createClient();
    await reconcileAssetChecks(supabase, identity.uid, job);
    finalization = { userId: identity.uid, attemptId };
    await markAttemptPackaging(supabase, identity.uid, attemptId);
    const item = await saveLibraryItem(supabase, identity.uid, {
      displayName,
      jobId: job.id,
      attemptId: job.attemptId,
      masterId: job.approvedMasterId,
      poses: job.poses.map((pose) => ({ ...pose, imageUrl: "" })),
    });
    const finalized = await publishMascotPackage(supabase, identity.uid, item.id);
    await markAttemptReady(supabase, identity.uid, attemptId);
    return NextResponse.json({ item: presentLibraryItem(finalized.item), package: finalized.package }, { status: 201 });
  } catch (error) {
    if (finalization) {
      const errorCode = error instanceof MascotPackageError ? error.code : "PACKAGE_FINALIZATION_FAILED";
      await markAttemptPackageFailed(await createClient(), finalization.userId, finalization.attemptId, errorCode).catch(() => undefined);
    }
    return integrationErrorResponse(error, "LIBRARY_SAVE_FAILED", "Não foi possível guardar este mascote agora.");
  }
}

async function verifyPoseAssets(job: GenerationJob, userId: string, attemptId: string) {
  const provider = getMascotGenerationProvider();
  await Promise.all(job.poses.map(async (pose) => {
    if (!pose.sha256 || !/^[a-f0-9]{64}$/.test(pose.sha256)) {
      throw new Error("POSE_CHECKSUM_MISSING");
    }
    const asset = await provider.getPoseImage?.(job.id, pose.role, jobIdentity(userId, attemptId));
    if (!asset || (pose.size !== undefined && pose.size !== asset.bytes.byteLength)) {
      throw new Error("POSE_ASSET_MISMATCH");
    }
    const digest = createHash("sha256").update(asset.bytes).digest("hex");
    if (digest !== pose.sha256) throw new Error("POSE_CHECKSUM_MISMATCH");
  }));
}

function hasCompletePoseSet(job: GenerationJob) {
  return isPoseSetReadyForPackaging(job.poses, job.poseSetQc);
}

function presentLibraryItem(item: Awaited<ReturnType<typeof saveLibraryItem>>) {
  return {
    ...item,
    poses: item.poses.map((pose) => ({
      ...pose,
      imageUrl: `/api/mascot/library/${encodeURIComponent(item.id)}/pose/${encodeURIComponent(pose.role)}`,
    })),
  };
}
