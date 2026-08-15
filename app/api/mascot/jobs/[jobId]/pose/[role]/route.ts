import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { PoseRole } from "@/lib/mascot-generation/types";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validRoles = new Set<PoseRole>(["normal", "listening", "transcribing"]);

export async function GET(request: Request, context: { params: Promise<{ jobId: string; role: string }> }) {
  const { jobId, role } = await context.params;
  if (!validId(jobId) || !validRoles.has(role as PoseRole)) {
    return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  }
  try {
    const [{ uid }, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return new NextResponse(null, { status: 404 });
    const provider = getMascotGenerationProvider();
    if (!provider.getPoseImage) return new NextResponse(null, { status: 404 });
    const image = await provider.getPoseImage(jobId, role as PoseRole, jobIdentity(uid, attemptId));
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("mascot_pose_read_failed", { jobId, role, error: error instanceof Error ? error.name : "unknown" });
    return integrationErrorResponse(error, "POSE_READ_FAILED", "Pose indisponível.");
  }
}
