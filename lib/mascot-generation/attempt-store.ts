import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationJob, GenerationJobStatus } from "./types";
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

export async function findLatestResumableAttempt(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("mascot_attempts")
    .select("*")
    .eq("user_id", userId)
    .in("status", RESUMABLE_ATTEMPT_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<MascotAttempt>();
  if (error) throw new MascotAttemptStoreError();
  return data;
}

export function isResumableAttemptStatus(status: GenerationJobStatus) {
  return RESUMABLE_ATTEMPT_STATUSES.includes(status);
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

export async function reserveAttempt(client: SupabaseClient, userId: string, attemptId: string) {
  const { error } = await client.from("mascot_attempts").upsert({
    user_id: userId,
    attempt_id: attemptId,
    status: "registered" satisfies GenerationJobStatus,
  }, { onConflict: "user_id,attempt_id", ignoreDuplicates: true });
  if (error) throw new MascotAttemptStoreError();
}

export async function saveAttemptJob(client: SupabaseClient, userId: string, job: GenerationJob, trace?: MascotTraceContext) {
  const now = new Date().toISOString();
  const { error } = await client.from("mascot_attempts").upsert({
    user_id: userId,
    attempt_id: job.attemptId,
    modal_job_id: job.id,
    status: job.status,
    selected_master_id: job.approvedMasterId ?? null,
    ...(trace ? { puleiro_trace_id: trace.puleiroTraceId, operation_id: trace.operationId ?? null } : {}),
    current_stage: job.status,
    last_error_code: job.errorCode ?? null,
    started_at: now,
    ...(isTerminal(job.status) ? { completed_at: now } : {}),
    updated_at: now,
  }, { onConflict: "user_id,attempt_id" });
  if (error) throw new MascotAttemptStoreError();
}

function isTerminal(status: GenerationJobStatus) {
  return ["ready", "failed", "canceled"].includes(status);
}
