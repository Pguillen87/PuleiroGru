import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { createClient } from "@/lib/supabase/server";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const startedAt = performance.now();
  let trace: MascotTraceContext | undefined;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido.", code: "INVALID_JOB_ID" }, { status: 400 });
  try {
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    trace = createTraceContext(attemptId);
    const job = await getMascotGenerationProvider().getJob(jobId, jobIdentity(identity.uid, attemptId, trace));
    if (!job) return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    if (identity.mode === "supabase-session") await saveAttemptJob(await createClient(), identity.uid, job);
    mascotLog("pose_status_read", { ...trace, jobId, result: "success", durationMs: Math.round(performance.now() - startedAt), httpStatus: 200 });
    return traceResponse(NextResponse.json({ job }, { status: 200 }), trace, job.requestId);
  } catch (error) {
    mascotLog("pose_status_read", { ...(trace ?? {}), jobId, result: "failure", durationMs: Math.round(performance.now() - startedAt), safeErrorCode: error instanceof Error ? error.name : "UNKNOWN" });
    return integrationErrorResponse(error, "JOB_READ_FAILED", "Não foi possível consultar o nascimento agora.", trace);
  }
}
