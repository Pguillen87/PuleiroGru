import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { DEFAULT_POSE_CHOICES, POSE_OPTIONS } from "@/lib/mascot-generation/pose-catalog";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import type { PoseChoices, PoseRole } from "@/lib/mascot-generation/types";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";
import { recordGenerationRequested } from "@/lib/mascot-generation/telemetry-store";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const startedAt = performance.now();
  const { jobId } = await context.params;
  let trace: MascotTraceContext | undefined;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado." }, { status: 404 });
    trace = createTraceContext(attemptId, true);
    if (!generationConfig.poseGenerationEnabled) {
      return traceResponse(NextResponse.json({ message: "A geração das poses ainda não foi habilitada.", code: "POSE_GENERATION_DISABLED", retryable: false }, { status: 503 }), trace);
    }
    const body = await request.json().catch(() => ({})) as { poseChoices?: PoseChoices };
    const poseChoices = validatePoseChoices(body.poseChoices);
    if (!poseChoices) {
      return NextResponse.json({ message: "Escolha uma opção válida para cada função.", code: "INVALID_POSE_CHOICES" }, { status: 400 });
    }
    mascotLog("pose_request_received", { ...trace, jobId });
    const job = await getMascotGenerationProvider().startPoseGeneration(
      jobId,
      poseChoices,
      jobIdentity(identity.uid, attemptId, trace),
    );
    const responseTrace = job.operationId ? { ...trace, operationId: job.operationId } : trace;
    if (identity.mode === "supabase-session") {
      const client = await createClient();
      await saveAttemptJob(client, identity.uid, job, trace);
      await recordGenerationRequested(client, identity.uid, job, "poses", trace).catch(() => undefined);
      mascotLog("pose_attempt_persisted", { ...responseTrace, jobId, result: "persisted" });
    }
    mascotLog(job.idempotentReplay ? "pose_operation_replayed" : "pose_operation_created", {
      ...responseTrace,
      jobId,
      result: "accepted",
      durationMs: Math.round(performance.now() - startedAt),
      httpStatus: 202,
    });
    return traceResponse(NextResponse.json({ job }, { status: 202 }), responseTrace, job.requestId);
  } catch (error) {
    mascotLog("pose_request_failed", {
      ...(trace ?? {}),
      jobId,
      result: "failure",
      durationMs: Math.round(performance.now() - startedAt),
      safeErrorCode: error instanceof Error ? error.name : "UNKNOWN",
      httpStatus: 503,
    });
    return integrationErrorResponse(error, "POSE_GENERATION_FAILED", "Não foi possível iniciar as poses agora.", trace);
  }
}

function validatePoseChoices(value: PoseChoices | undefined): PoseChoices | null {
  const choices = value ?? DEFAULT_POSE_CHOICES;
  const roles: PoseRole[] = ["normal", "listening", "transcribing"];
  if (Object.keys(choices).length !== roles.length) return null;
  for (const role of roles) {
    if (!POSE_OPTIONS.some((option) => option.role === role && option.id === choices[role])) {
      return null;
    }
  }
  return choices;
}
