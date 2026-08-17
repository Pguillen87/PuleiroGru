import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { saveLibraryItem } from "@/lib/mascot-generation/library-store";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { GeneratedPose, PoseRole } from "@/lib/mascot-generation/types";
import { createClient } from "@/lib/supabase/server";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const expectedRoles: PoseRole[] = ["normal", "listening", "transcribing"];

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado." }, { status: 404 });
    if (identity.mode !== "supabase-session") {
      return NextResponse.json({ message: "Entre em sua conta para guardar o mascote.", code: "SESSION_REQUIRED" }, { status: 401 });
    }
    const job = await getMascotGenerationProvider().getJob(jobId, jobIdentity(identity.uid, attemptId));
    if (!job || job.status !== "awaiting_set_approval" || !job.approvedMasterId || !hasCompletePoseSet(job.poses)) {
      return NextResponse.json({ message: "As três poses ainda não estão prontas para guardar.", code: "POSE_SET_NOT_READY" }, { status: 409 });
    }
    const item = await saveLibraryItem(await createClient(), identity.uid, {
      jobId: job.id,
      attemptId: job.attemptId,
      masterId: job.approvedMasterId,
      poses: job.poses.map((pose) => ({ ...pose, imageUrl: "" })),
    });
    return NextResponse.json({ item: presentLibraryItem(item) }, { status: 201 });
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_SAVE_FAILED", "Não foi possível guardar este mascote agora.");
  }
}

function hasCompletePoseSet(poses: GeneratedPose[]) {
  return poses.length === expectedRoles.length && expectedRoles.every((role) => poses.filter((pose) => pose.role === role).length === 1);
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
