import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { createClient } from "@/lib/supabase/server";
import { recordGenerationRequested } from "@/lib/mascot-generation/telemetry-store";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";
import { ModalProviderError } from "@/lib/mascot-generation/modal-provider";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  let trace: MascotTraceContext | undefined;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido.", code: "INVALID_JOB_ID" }, { status: 400 });

  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    trace = createTraceContext(attemptId, true);
    if (!generationConfig.masterGenerationEnabled) {
      mascotLog("master_generation_start_blocked", { ...trace, jobId, result: "blocked", safeErrorCode: "GENERATION_DISABLED", httpStatus: 503 });
      return traceResponse(NextResponse.json({
        message: "A geração de mascotes está temporariamente indisponível.",
        code: "GENERATION_DISABLED",
        retryable: false,
      }, { status: 503 }), trace);
    }
    const job = await getMascotGenerationProvider().startMasterGeneration(jobId, jobIdentity(identity.uid, attemptId, trace));
    if (identity.mode === "supabase-session") {
      const client = await createClient();
      await saveAttemptJob(client, identity.uid, job, trace);
      await recordGenerationRequested(client, identity.uid, job, "master", trace).catch(() => undefined);
    }
    const responseTrace = job.operationId ? { ...trace, operationId: job.operationId } : trace;
    return traceResponse(NextResponse.json({ job }, { status: 202 }), responseTrace, job.requestId);
  } catch (error) {
    const modalError = error instanceof ModalProviderError ? error : undefined;
    mascotLog("master_generation_start_failed", {
      result: "failed",
      puleiroTraceId: trace?.puleiroTraceId,
      attemptId: trace?.attemptId,
      operationId: trace?.operationId,
      requestId: trace?.requestId,
      jobId,
      safeErrorCode: modalError?.code ?? (error instanceof Error ? error.name : "UNKNOWN"),
      httpStatus: modalError?.status ?? 503,
    });
    return integrationErrorResponse(error, "MASTER_GENERATION_FAILED", "Não foi possível iniciar o nascimento agora.", trace);
  }
}
