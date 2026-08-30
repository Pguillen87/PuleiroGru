import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { attemptCookie, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findIncubationAttempts, incubationProductState, reserveAttempt, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { DEFAULT_POSE_CHOICES, POSE_OPTIONS } from "@/lib/mascot-generation/pose-catalog";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { parseSubjectIdentity } from "@/lib/mascot-generation/subject-identity";
import type { PoseChoices, SubjectHint } from "@/lib/mascot-generation/types";
import { validateAndSanitizeImage } from "@/lib/mascot-generation/validation";
import { createTraceContext } from "@/lib/observability/mascot-trace";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    const supabase = await createClient();
    const attempts = await findIncubationAttempts(supabase, identity.uid);
    const provider = getMascotGenerationProvider();
    const eggs = await Promise.all(attempts.map(async (attempt) => {
      const trace = createTraceContext(attempt.attempt_id, false);
      const job = attempt.modal_job_id
        ? await provider.getJob(attempt.modal_job_id, jobIdentity(identity.uid, attempt.attempt_id, trace)).catch(() => null)
        : null;
      return {
        jobId: attempt.modal_job_id,
        attemptId: attempt.attempt_id,
        productState: job?.productState ?? incubationProductState(attempt),
        phase: job?.status ?? attempt.current_stage ?? attempt.status,
        updatedAt: attempt.updated_at,
        generationReadyAt: job?.generationReadyAt ?? attempt.generation_ready_at ?? undefined,
        hatchedAt: attempt.hatched_at ?? undefined,
        errorCode: job?.errorCode ?? attempt.last_error_code ?? undefined,
        selectedMasterId: job?.approvedMasterId ?? attempt.selected_master_id ?? undefined,
        poseCount: job?.poses.length ?? 0,
      };
    }));
    return NextResponse.json({ incubations: eggs.filter((egg) => egg.jobId) });
  } catch (error) {
    return integrationErrorResponse(error, "INCUBATION_LIST_FAILED", "Não foi possível abrir a Incubadora.");
  }
}

export async function POST(request: Request) {
  let attemptId = "";
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["multipart/form-data"] });
    if (!generationConfig.incubatorFlowEnabled) {
      return NextResponse.json({ message: "A Incubadora ainda não está disponível.", code: "INCUBATOR_DISABLED" }, { status: 503 });
    }
    const identity = await requireBrowserIdentity(request);
    const idempotencyKey = request.headers.get("x-puleiro-incubation-key") ?? "";
    if (!UUID.test(idempotencyKey)) {
      return NextResponse.json({ message: "A chave deste nascimento é inválida.", code: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
    }
    attemptId = `incubator_${idempotencyKey.replaceAll("-", "")}`;
    const trace = createTraceContext(attemptId, true);
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) return NextResponse.json({ message: "Selecione uma foto.", code: "PHOTO_REQUIRED" }, { status: 400 });
    const subjectIdentity = parseSubjectIdentity(form);
    const poseChoices = parsePoseChoices(form.get("poseChoices"));
    const hint = parseSubjectHint(form.get("subjectHint"));
    if (hint?.requiresConfirmation && !hint.overrideConfirmed) {
      return NextResponse.json({ message: "Confirme a diferença entre a foto e o tipo escolhido.", code: "SUBJECT_MISMATCH_CONFIRMATION_REQUIRED" }, { status: 409 });
    }
    const image = await validateAndSanitizeImage(photo, generationConfig.maxUploadBytes, generationConfig.maxImageDimension);
    const supabase = await createClient();
    await reserveAttempt(supabase, identity.uid, attemptId, { subjectIdentity, poseChoices, subjectHint: hint });
    const provider = getMascotGenerationProvider();
    if (!provider.createIncubation) throw new Error("INCUBATOR_PROVIDER_UNAVAILABLE");
    const job = await provider.createIncubation({
      ...image,
      ...jobIdentity(identity.uid, attemptId, trace),
      idempotencyKey: `incubation:${identity.uid}:${attemptId}`,
      subjectIdentity,
      poseChoices,
      subjectHint: hint,
    });
    await saveAttemptJob(supabase, identity.uid, job, trace);
    const response = NextResponse.json({ job }, { status: 202 });
    response.cookies.set(attemptCookie(attemptId));
    return response;
  } catch (error) {
    return integrationErrorResponse(error, "INCUBATION_CREATE_FAILED", "Não foi possível colocar este ovo na Incubadora.");
  }
}

function parsePoseChoices(value: FormDataEntryValue | null): PoseChoices {
  const parsed = JSON.parse(String(value ?? "{}")) as Partial<PoseChoices>;
  const validIds = new Set(POSE_OPTIONS.map((option) => option.id));
  const choices = { ...DEFAULT_POSE_CHOICES, ...parsed };
  if (!validIds.has(choices.normal) || !validIds.has(choices.listening) || !validIds.has(choices.transcribing)) {
    throw new Error("POSE_CHOICES_INVALID");
  }
  return choices;
}

function parseSubjectHint(value: FormDataEntryValue | null): SubjectHint | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(String(value)) as SubjectHint;
  if (parsed.version !== "subject-hint-v1" || typeof parsed.requiresConfirmation !== "boolean" || typeof parsed.overrideConfirmed !== "boolean") {
    throw new Error("SUBJECT_HINT_INVALID");
  }
  return parsed;
}
