import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttempt, findAttemptByJobId } from "@/lib/mascot-generation/attempt-store";
import { createClient } from "@/lib/supabase/server";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { PoseRole } from "@/lib/mascot-generation/types";
import { prepareMascotDisplayAsset } from "@/lib/mascot-generation/display-asset";
import { getCachedMascotAsset } from "@/lib/mascot-generation/asset-cache";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validRoles = new Set<PoseRole>(["normal", "listening", "transcribing"]);

export async function GET(request: Request, context: { params: Promise<{ jobId: string; role: string }> }) {
  const { jobId, role } = await context.params;
  if (!validId(jobId) || !validRoles.has(role as PoseRole)) {
    return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  }
  try {
    const [identity, cookieAttemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    let attemptId = cookieAttemptId;
    if (identity.mode === "supabase-session") {
      const client = await createClient();
      const linkedAttempt = await findAttemptByJobId(client, identity.uid, jobId);
      if (linkedAttempt?.workflow_mode === "async_incubator_v1") {
        attemptId = linkedAttempt.attempt_id;
      } else if (!linkedAttempt && cookieAttemptId) {
        const legacyAttempt = await findAttempt(client, identity.uid, cookieAttemptId);
        if (!legacyAttempt || legacyAttempt.modal_job_id !== jobId) attemptId = undefined;
      } else if (!linkedAttempt) {
        attemptId = undefined;
      }
    }
    if (!attemptId) return new NextResponse(null, { status: 404 });
    const provider = getMascotGenerationProvider();
    if (!provider.getPoseImage) return new NextResponse(null, { status: 404 });
    const sourceImage = await getCachedMascotAsset(
      `pose:${identity.uid}:${attemptId}:${jobId}:${role}`,
      () => provider.getPoseImage!(jobId, role as PoseRole, jobIdentity(identity.uid, attemptId)),
    );
    const image = sourceImage ? await prepareMascotDisplayAsset(sourceImage) : null;
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("mascot_pose_read_failed", { jobId, role, error: error instanceof Error ? error.name : "unknown" });
    return integrationErrorResponse(error, "POSE_READ_FAILED", "Pose indisponível.");
  }
}
