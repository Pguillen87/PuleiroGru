import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GenerationJob,
  GenerationJobStatus,
  IncubationProductState,
  MascotWorkflowMode,
  PoseChoices,
  SubjectHint,
  SubjectIdentity,
} from "./types";
import type { MascotTraceContext } from "@/lib/observability/mascot-trace";

export type MascotAttempt = {
  id: string;
  user_id: string;
  attempt_id: string;
  modal_job_id: string | null;
  status: GenerationJobStatus;
  selected_master_id: string | null;
  puleiro_trace_id?: string | null;
  operation_id?: string | null;
  current_stage?: string | null;
  last_error_code?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  workflow_mode?: MascotWorkflowMode | null;
  incubation_config?: { subjectIdentity: SubjectIdentity; poseChoices: PoseChoices } | null;
  subject_hint?: SubjectHint | null;
  master_selection?: GenerationJob["masterSelection"] | null;
  generation_ready_at?: string | null;
  hatched_at?: string | null;
  created_at: string;
  updated_at: string;
};

export class MascotAttemptStoreError extends Error {
  constructor(message = "Não foi possível preservar esta tentativa.") {
    super(message);
  }
}

const RESUMABLE_ATTEMPT_STATUSES: GenerationJobStatus[] = [
  "registered",
  "awaiting_generation_authorization",
  "queued",
  "generating_masters",
  "awaiting_master_approval",
  "master_approved",
  "generating_poses",
  "awaiting_set_approval",
  "packaging",
  "failed",
];

export async function findAttempt(client: SupabaseClient, userId: string, attemptId: string) {
  const { data, error } = await client.from("mascot_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .maybeSingle<MascotAttempt>();
  if (error) throw new MascotAttemptStoreError();
  return data;
}

export async function findAttemptByJobId(client: SupabaseClient, userId: string, jobId: string) {
  const { data, error } = await client.from("mascot_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("modal_job_id", jobId)
    .maybeSingle<MascotAttempt>();
  if (error) throw new MascotAttemptStoreError();
  return data;
}

export async function findResumableAttempts(client: SupabaseClient, userId: string, limit = 10) {
  const { data, error } = await client.from("mascot_attempts")
    .select("*")
    .eq("user_id", userId)
    .in("status", RESUMABLE_ATTEMPT_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(limit)
    .returns<MascotAttempt[]>();
  if (error) throw new MascotAttemptStoreError();
  return data ?? [];
}

export async function findIncubationAttempts(client: SupabaseClient, userId: string, limit = 24) {
  const { data, error } = await client.from("mascot_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("workflow_mode", "async_incubator_v1")
    .neq("status", "ready")
    .order("updated_at", { ascending: false })
    .limit(limit)
    .returns<MascotAttempt[]>();
  if (error) throw new MascotAttemptStoreError();
  return data ?? [];
}

export function incubationProductState(attempt: MascotAttempt): IncubationProductState {
  if (attempt.status === "ready") return "PACKAGE_READY";
  if (attempt.status === "failed" || attempt.status === "canceled") return "FAILED";
  if (attempt.hatched_at) return "HATCHED";
  if (attempt.generation_ready_at || attempt.status === "awaiting_set_approval") return "READY_TO_HATCH";
  if (["registered", "awaiting_generation_authorization", "queued"].includes(attempt.status)) return "PREPARING";
  return "INCUBATING";
}

export function prioritizeAttempt(attempts: MascotAttempt[], attemptId: string | undefined) {
  if (!attemptId) return attempts;
  const preferred = attempts.find((attempt) => attempt.attempt_id === attemptId);
  return preferred
    ? [preferred, ...attempts.filter((attempt) => attempt.attempt_id !== attemptId)]
    : attempts;
}

export function isResumableAttemptStatus(status: GenerationJobStatus) {
  return RESUMABLE_ATTEMPT_STATUSES.includes(status);
}

export function isDeletableAttemptStatus(status: GenerationJobStatus) {
  return status === "registered" || status === "awaiting_generation_authorization";
}

export async function markAttemptReady(client: SupabaseClient, userId: string, attemptId: string) {
  const { data, error } = await client.from("mascot_attempts")
    .update({ status: "ready" satisfies GenerationJobStatus, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !data) throw new MascotAttemptStoreError();
}

export async function markAttemptPackaging(client: SupabaseClient, userId: string, attemptId: string) {
  await updateAttemptFinalization(client, userId, attemptId, "packaging", null);
}

export async function markAttemptPackageFailed(client: SupabaseClient, userId: string, attemptId: string, errorCode: string) {
  await updateAttemptFinalization(client, userId, attemptId, "failed", errorCode);
}

async function updateAttemptFinalization(
  client: SupabaseClient,
  userId: string,
  attemptId: string,
  status: GenerationJobStatus,
  errorCode: string | null,
) {
  const { data, error } = await client.from("mascot_attempts")
    .update({ status, current_stage: status, last_error_code: errorCode, updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("attempt_id", attemptId).select("id").maybeSingle<{ id: string }>();
  if (error || !data) throw new MascotAttemptStoreError();
}

export async function deleteAttempt(client: SupabaseClient, userId: string, attemptId: string, jobId: string) {
  const { data, error } = await client.from("mascot_attempts")
    .delete()
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .eq("modal_job_id", jobId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !data) throw new MascotAttemptStoreError("Não foi possível excluir esta tentativa.");
}

export async function reserveAttempt(
  client: SupabaseClient,
  userId: string,
  attemptId: string,
  incubator?: { subjectIdentity: SubjectIdentity; poseChoices: PoseChoices; subjectHint?: SubjectHint },
) {
  const { error } = await client.from("mascot_attempts").upsert({
    user_id: userId,
    attempt_id: attemptId,
    status: "registered" satisfies GenerationJobStatus,
    ...(incubator ? {
      workflow_mode: "async_incubator_v1" satisfies MascotWorkflowMode,
      incubation_config: { subjectIdentity: incubator.subjectIdentity, poseChoices: incubator.poseChoices },
      subject_hint: incubator.subjectHint ?? null,
    } : {}),
  }, { onConflict: "user_id,attempt_id", ignoreDuplicates: true });
  if (error) throw new MascotAttemptStoreError();
}

export async function saveAttemptJob(client: SupabaseClient, userId: string, job: GenerationJob, trace?: MascotTraceContext) {
  const now = new Date().toISOString();
  // Polling reconciles the same attempt repeatedly. Its start time belongs to
  // the first durable write, never to the latest status observation.
  const existing = await findAttempt(client, userId, job.attemptId);
  const { error } = await client.from("mascot_attempts").upsert({
    user_id: userId,
    attempt_id: job.attemptId,
    modal_job_id: job.id,
    status: job.status,
    selected_master_id: job.approvedMasterId ?? null,
    ...(trace ? { puleiro_trace_id: trace.puleiroTraceId, operation_id: trace.operationId ?? null } : {}),
    current_stage: job.status,
    last_error_code: job.errorCode ?? null,
    workflow_mode: job.workflowMode ?? existing?.workflow_mode ?? null,
    subject_hint: job.subjectHint ?? existing?.subject_hint ?? null,
    master_selection: job.masterSelection ?? existing?.master_selection ?? null,
    ...(job.generationReadyAt || job.status === "awaiting_set_approval"
      ? { generation_ready_at: job.generationReadyAt ?? existing?.generation_ready_at ?? now }
      : {}),
    ...(job.hatchedAt ? { hatched_at: job.hatchedAt } : {}),
    started_at: existing?.started_at ?? now,
    ...(isTerminal(job.status) ? { completed_at: now } : {}),
    updated_at: now,
  }, { onConflict: "user_id,attempt_id" });
  if (error) throw new MascotAttemptStoreError();
}

export async function markAttemptHatched(client: SupabaseClient, userId: string, attemptId: string, jobId: string) {
  const now = new Date().toISOString();
  const { data, error } = await client.from("mascot_attempts")
    .update({ hatched_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .eq("modal_job_id", jobId)
    .not("generation_ready_at", "is", null)
    .select("id,hatched_at")
    .maybeSingle<{ id: string; hatched_at: string }>();
  if (error || !data) throw new MascotAttemptStoreError("Este ovo ainda não está pronto para chocar.");
  return data.hatched_at;
}

function isTerminal(status: GenerationJobStatus) {
  return ["ready", "failed", "canceled"].includes(status);
}
