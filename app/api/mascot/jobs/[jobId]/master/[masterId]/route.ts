import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttempt, findAttemptByJobId } from "@/lib/mascot-generation/attempt-store";
import { createClient } from "@/lib/supabase/server";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function GET(request: Request, context: { params: Promise<{ jobId: string; masterId: string }> }) {
  const { jobId, masterId } = await context.params;
  const startedAt = performance.now();
  let trace: MascotTraceContext | undefined;
  if (!validId(jobId) || !validId(masterId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
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
    trace = createTraceContext(attemptId);
    const provider = getMascotGenerationProvider();
    if (!provider.getMasterImage) return new NextResponse(null, { status: 404 });
    const sourceImage = await provider.getMasterImage(jobId, masterId, jobIdentity(identity.uid, attemptId, trace));
    // Modal promotes only the separately QC-approved RGBA derivative into
    // this endpoint. Do not repair or silently fall back to a raw Master in
    // the BFF: an invalid derivative must remain observable and fail closed.
    const image = sourceImage;
    if (!image) return new NextResponse(null, { status: 404 });
    mascotLog("master_image_read", { ...trace, jobId, masterId, result: "success", durationMs: Math.round(performance.now() - startedAt), httpStatus: 200 });
    return traceResponse(new NextResponse(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    }), trace);
  } catch (error) {
    mascotLog("master_image_read", { ...(trace ?? {}), jobId, masterId, result: "failure", durationMs: Math.round(performance.now() - startedAt), safeErrorCode: error instanceof Error ? error.name : "UNKNOWN" });
    return integrationErrorResponse(error, "MASTER_READ_FAILED", "Imagem indisponível.", trace);
  }
}
