import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { attemptCookie, getOrCreateAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttempt, reserveAttempt, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { GenerationJob } from "@/lib/mascot-generation/types";
import { ImageValidationError, validateAndSanitizeImage } from "@/lib/mascot-generation/validation";
import { parseSubjectIdentity, SubjectIdentityError } from "@/lib/mascot-generation/subject-identity";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    if (!generationConfig.registrationEnabled) {
      return NextResponse.json({ message: "Novos registros estão temporariamente pausados.", code: "REGISTRATION_DISABLED" }, { status: 409 });
    }

    const attemptId = await getOrCreateAttemptId();
    const provider = getMascotGenerationProvider();
    const supabase = identity.mode === "supabase-session" ? await createClient() : null;
    const existing = supabase ? await findAttempt(supabase, identity.uid, attemptId) : null;
    if (existing?.modal_job_id) {
      const existingJob = await provider.getJob(existing.modal_job_id, jobIdentity(identity.uid, attemptId));
      if (existingJob) return jobResponse(existingJob, attemptId);
    }

    validateDeclaredLength(request);
    const formData = await request.formData();
    const photo = formData.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json({ message: "Selecione uma foto para continuar.", code: "PHOTO_REQUIRED" }, { status: 400 });
    }

    const subjectIdentity = parseSubjectIdentity(formData);
    const image = await validateAndSanitizeImage(photo, generationConfig.maxUploadBytes, generationConfig.maxImageDimension);
    const context = jobIdentity(identity.uid, attemptId);
    if (supabase) await reserveAttempt(supabase, identity.uid, attemptId);
    const job = await provider.createMasterJob({
      ...image,
      ...context,
      idempotencyKey: `register:${identity.uid}:${attemptId}`,
      subjectIdentity,
    });
    if (supabase) await saveAttemptJob(supabase, identity.uid, job);
    const response = jobResponse(job, attemptId);
    response.headers.set("X-Correlation-Id", context.correlationId);
    return response;
  } catch (error) {
    if (error instanceof ImageValidationError || error instanceof SubjectIdentityError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 400 });
    }
    console.error("mascot_job_create_failed", { error: error instanceof Error ? error.name : "unknown" });
    return integrationErrorResponse(error, "CREATE_JOB_FAILED", "Não conseguimos registrar este nascimento.");
  }
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
