import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { DEFAULT_POSE_CHOICES, POSE_OPTIONS } from "@/lib/mascot-generation/pose-catalog";
import type { MascotConfiguration, PoseChoices, PoseRole } from "@/lib/mascot-generation/types";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

type ConfigurationPatch = Partial<Pick<MascotConfiguration, "displayName" | "poseChoices">> & {
  configurationRevision?: number;
};

export async function PATCH(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const startedAt = performance.now();
  const { jobId } = await context.params;
  let trace: MascotTraceContext | undefined;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    const body = await request.json().catch(() => ({})) as ConfigurationPatch;
    const configurationRevision = body.configurationRevision;
    if (!Number.isInteger(configurationRevision) || (configurationRevision ?? -1) < 0) {
      return NextResponse.json({ message: "A versão da configuração é obrigatória.", code: "CONFIGURATION_REVISION_REQUIRED" }, { status: 400 });
    }
    const revision = configurationRevision as number;
    if (body.displayName !== undefined && !validDisplayName(body.displayName)) {
      return NextResponse.json({ message: "Use um nome entre 2 e 32 caracteres válidos.", code: "INVALID_DISPLAY_NAME" }, { status: 400 });
    }
    if (body.poseChoices !== undefined && !validPoseChoices(body.poseChoices)) {
      return NextResponse.json({ message: "Escolha uma opção válida para cada função.", code: "INVALID_POSE_CHOICES" }, { status: 400 });
    }
    trace = createTraceContext(attemptId, true);
    const job = await getMascotGenerationProvider().updateConfiguration(jobId, {
      displayName: body.displayName?.trim().replace(/\s+/g, " "),
      poseChoices: body.poseChoices,
      configurationRevision: revision,
    }, jobIdentity(identity.uid, attemptId, trace));
    if (identity.mode === "supabase-session") await saveAttemptJob(await createClient(), identity.uid, job, trace);
    mascotLog("mascot_configuration_saved", {
      ...trace,
      jobId,
      result: "saved",
      durationMs: Math.round(performance.now() - startedAt),
    });
    return traceResponse(NextResponse.json({ job }, { status: 200 }), trace, job.requestId);
  } catch (error) {
    mascotLog("mascot_configuration_save_failed", {
      ...trace,
      jobId,
      result: "failed",
      durationMs: Math.round(performance.now() - startedAt),
      safeErrorCode: error instanceof Error && "code" in error ? String(error.code) : "CONFIGURATION_SAVE_FAILED",
    });
    return integrationErrorResponse(error, "CONFIGURATION_SAVE_FAILED", "Não foi possível salvar esta configuração agora.", trace);
  }
}

function validPoseChoices(value: PoseChoices) {
  const roles: PoseRole[] = ["normal", "listening", "transcribing"];
  const choices = value ?? DEFAULT_POSE_CHOICES;
  return Object.keys(choices).length === roles.length && roles.every((role) =>
    POSE_OPTIONS.some((option) => option.role === role && option.id === choices[role]),
  );
}

function validDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length >= 2 && normalized.length <= 32 && /^[\p{L}\p{N} .'-]+$/u.test(normalized);
}
