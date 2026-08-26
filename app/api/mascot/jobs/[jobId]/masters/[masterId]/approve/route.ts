import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { createClient } from "@/lib/supabase/server";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string; masterId: string }> }) {
  const startedAt = performance.now();
  const { jobId, masterId } = await context.params;
  let trace: MascotTraceContext | undefined;
  if (!validId(jobId) || !validId(masterId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    trace = createTraceContext(attemptId, true);
    mascotLog("master_approval_requested", { ...trace, jobId, masterId, stage: "bff" });
    const job = await getMascotGenerationProvider().approveMaster(jobId, masterId, jobIdentity(identity.uid, attemptId, trace));
    mascotLog("master_approval_modal_completed", { ...trace, jobId, masterId, stage: "modal", durationMs: Math.round(performance.now() - startedAt) });
    if (identity.mode === "supabase-session") await saveAttemptJob(await createClient(), identity.uid, job, trace);
    mascotLog("master_approval_persisted", { ...trace, jobId, masterId, stage: "supabase", durationMs: Math.round(performance.now() - startedAt) });
    const responseTrace = job.operationId ? { ...trace, operationId: job.operationId } : trace;
    return traceResponse(NextResponse.json({ job }, { status: 200 }), responseTrace, job.requestId);
  } catch (error) {
    mascotLog("master_approval_failed", { ...(trace ?? {}), jobId, masterId, result: "failure", durationMs: Math.round(performance.now() - startedAt), safeErrorCode: error instanceof Error ? error.name : "UNKNOWN" });
    return integrationErrorResponse(error, "APPROVAL_FAILED", "Não foi possível aprovar este mascote agora.", trace);
  }
}
