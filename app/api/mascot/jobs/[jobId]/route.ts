import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { ATTEMPT_COOKIE, getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { deleteAttempt, findAttempt, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { createClient } from "@/lib/supabase/server";
import { reconcileGenerationTelemetry } from "@/lib/mascot-generation/telemetry-store";
import { reconcileAssetChecks } from "@/lib/mascot-generation/asset-check-store";
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
    if (identity.mode === "supabase-session") {
      const client = await createClient();
      await saveAttemptJob(client, identity.uid, job, trace);
      const reconciliations = await Promise.allSettled([
        reconcileGenerationTelemetry(client, identity.uid, job),
        reconcileAssetChecks(client, identity.uid, job),
      ]);
      reconciliations.forEach((result, index) => {
        if (result.status === "rejected") mascotLog("generation_reconciliation_failed", {
          ...trace, jobId, result: "failure", stage: index === 0 ? "telemetry" : "asset_checks",
          safeErrorCode: result.reason instanceof Error ? result.reason.name : "UNKNOWN",
        });
      });
    }
    mascotLog("generation_status_read", { ...trace, jobId, result: "success", durationMs: Math.round(performance.now() - startedAt), httpStatus: 200, stage: job.status });
    return traceResponse(NextResponse.json({ job }, { status: 200 }), trace, job.requestId);
  } catch (error) {
    mascotLog("generation_status_read", { ...(trace ?? {}), jobId, result: "failure", durationMs: Math.round(performance.now() - startedAt), safeErrorCode: error instanceof Error ? error.name : "UNKNOWN" });
    return integrationErrorResponse(error, "JOB_READ_FAILED", "Não foi possível consultar o nascimento agora.", trace);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const startedAt = performance.now();
  let trace: MascotTraceContext | undefined;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido.", code: "INVALID_JOB_ID" }, { status: 400 });
  try {
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId || identity.mode !== "supabase-session") {
      return NextResponse.json({ message: "Entre novamente para excluir este nascimento.", code: "DELETION_REQUIRES_SESSION" }, { status: 403 });
    }
    trace = createTraceContext(attemptId, true);
    const client = await createClient();
    const attempt = await findAttempt(client, identity.uid, attemptId);
    if (!attempt || attempt.modal_job_id !== jobId) {
      return traceResponse(NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 }), trace);
    }
    const deletion = await getMascotGenerationProvider().deleteJob(jobId, jobIdentity(identity.uid, attemptId, trace));
    await deleteAttempt(client, identity.uid, attemptId, jobId);
    mascotLog("generation_deleted", {
      ...trace, jobId, result: deletion.idempotentReplay ? "idempotent_replay" : "deleted",
      durationMs: Math.round(performance.now() - startedAt), httpStatus: 202,
    });
    const response = traceResponse(NextResponse.json({ deleted: true }, { status: 202 }), trace);
    response.cookies.delete(ATTEMPT_COOKIE);
    return response;
  } catch (error) {
    mascotLog("generation_deleted", {
      ...(trace ?? {}), jobId, result: "failure", durationMs: Math.round(performance.now() - startedAt),
      safeErrorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
    return integrationErrorResponse(error, "JOB_DELETE_FAILED", "Não foi possível excluir este nascimento agora.", trace);
  }
}
