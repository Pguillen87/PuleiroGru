import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { attemptCookie, getOrCreateAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttempt, reserveAttempt, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { ModalProviderError } from "@/lib/mascot-generation/modal-provider";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { GenerationJob, JobIdentity, MascotGenerationProvider } from "@/lib/mascot-generation/types";
import { ImageValidationError, validateAndSanitizeImage } from "@/lib/mascot-generation/validation";
import { parseSubjectIdentity, SubjectIdentityError } from "@/lib/mascot-generation/subject-identity";
import { createClient } from "@/lib/supabase/server";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let trace: MascotTraceContext | undefined;
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["multipart/form-data"] });
    const identity = await requireBrowserIdentity(request);
    const newAttempt = request.headers.get("x-puleiro-new-attempt") === "true";
    const attemptId = newAttempt ? crypto.randomUUID() : await getOrCreateAttemptId();
    trace = createTraceContext(attemptId, true);
    if (!generationConfig.registrationEnabled) {
      mascotLog("registration_requested", { ...trace, result: "blocked", safeErrorCode: "REGISTRATION_DISABLED", httpStatus: 503 });
      const response = NextResponse.json({
        message: "Novos nascimentos estão temporariamente indisponíveis.",
        code: "REGISTRATION_DISABLED",
        retryable: false,
        supportCode: trace.requestId.slice(0, 10).toUpperCase(),
      }, { status: 503 });
      return traceResponse(response, trace);
    }
    mascotLog("registration_requested", { ...trace, result: "started" });
    const provider = getMascotGenerationProvider();
    const supabase = identity.mode === "supabase-session" ? await createClient() : null;
    const existing = supabase ? await findAttempt(supabase, identity.uid, attemptId) : null;
    if (existing?.modal_job_id) {
      const existingJob = await provider.getJob(existing.modal_job_id, jobIdentity(identity.uid, attemptId, trace));
      if (existingJob) return jobResponse(existingJob, attemptId);
    }

    const context = jobIdentity(identity.uid, attemptId, trace);
    if (existing && !existing.modal_job_id) {
      const recovered = await recoverRegisteredJob(provider, context);
      if (recovered) {
        if (supabase) await saveAttemptJob(supabase, identity.uid, recovered, trace);
        mascotLog("mascot_registration_reconciled", { ...trace, jobId: recovered.id, result: "recovered", httpStatus: 200 });
        return traceResponse(jobResponse(recovered, attemptId), trace, recovered.requestId);
      }
    }

    validateDeclaredLength(request);
    const formData = await request.formData();
    const photo = formData.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json({ message: "Selecione uma foto para continuar.", code: "PHOTO_REQUIRED" }, { status: 400 });
    }

    const subjectIdentity = parseSubjectIdentity(formData);
    const image = await validateAndSanitizeImage(photo, generationConfig.maxUploadBytes, generationConfig.maxImageDimension);
    if (supabase) await reserveAttempt(supabase, identity.uid, attemptId);
    let job: GenerationJob;
    try {
      job = await provider.createMasterJob({
        ...image,
        ...context,
        idempotencyKey: `register:${identity.uid}:${attemptId}`,
        subjectIdentity,
      });
    } catch (error) {
      if (error instanceof ModalProviderError) throw error;
      mascotLog("mascot_registration_response_uncertain", {
        ...trace,
        result: "reconciling",
        safeErrorCode: error instanceof Error ? error.name : "UNKNOWN",
      });
      const recovered = await recoverRegisteredJob(provider, context);
      if (!recovered) return registrationPendingResponse(attemptId, trace);
      job = recovered;
      mascotLog("mascot_registration_reconciled", { ...trace, jobId: job.id, result: "recovered", httpStatus: 200 });
    }
    if (supabase) await saveAttemptJob(supabase, identity.uid, job, trace);
    mascotLog("registration_confirmed", { ...trace, jobId: job.id, result: "accepted", httpStatus: 202 });
    const response = jobResponse(job, attemptId);
    return traceResponse(response, trace, job.requestId);
  } catch (error) {
    if (error instanceof ImageValidationError || error instanceof SubjectIdentityError) {
      mascotLog("photo_validation_rejected", {
        result: "rejected",
        puleiroTraceId: trace?.puleiroTraceId,
        attemptId: trace?.attemptId,
        operationId: trace?.operationId,
        requestId: trace?.requestId,
        safeErrorCode: error.code,
        httpStatus: 400,
      });
      const response = NextResponse.json({ message: error.message, code: error.code }, { status: 400 });
      return trace ? traceResponse(response, trace) : response;
    }
    console.error("mascot_job_create_failed", { error: error instanceof Error ? error.name : "unknown" });
    return integrationErrorResponse(error, "CREATE_JOB_FAILED", "Não conseguimos registrar este nascimento.", trace);
  }
}

async function recoverRegisteredJob(provider: MascotGenerationProvider, identity: JobIdentity) {
  try {
    return await provider.getJobByAttempt(identity);
  } catch {
    return null;
  }
}

function registrationPendingResponse(attemptId: string, trace: MascotTraceContext) {
  const response = NextResponse.json({
    message: "O registro ainda está sendo confirmado. Retome o nascimento sem enviar a foto novamente.",
    code: "REGISTRATION_CONFIRMATION_PENDING",
    supportCode: trace.requestId.slice(0, 10).toUpperCase(),
  }, { status: 503 });
  response.cookies.set(attemptCookie(attemptId));
  return traceResponse(response, trace);
}

function validateDeclaredLength(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > generationConfig.maxUploadBytes + 1024 * 1024) {
    throw new ImageValidationError("A imagem excede o limite permitido.", "FILE_TOO_LARGE");
  }
}

function jobResponse(job: GenerationJob, attemptId: string) {
  const response = NextResponse.json({ job }, { status: job.status === "registered" ? 201 : 202 });
  response.cookies.set(attemptCookie(attemptId));
  return response;
}
