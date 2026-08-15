import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationJob, GenerationJobStatus } from "./types";

export type MascotAttempt = {
  id: string;
  user_id: string;
  attempt_id: string;
  modal_job_id: string | null;
  status: GenerationJobStatus;
  selected_master_id: string | null;
  created_at: string;
  updated_at: string;
};

export class MascotAttemptStoreError extends Error {
  constructor(message = "Não foi possível preservar esta tentativa.") {
    super(message);
  }
}

export async function findAttempt(client: SupabaseClient, userId: string, attemptId: string) {
  const { data, error } = await client.from("mascot_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .maybeSingle<MascotAttempt>();
  if (error) throw new MascotAttemptStoreError();
  return data;
}

export async function findLatestAttempt(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("mascot_attempts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<MascotAttempt>();
  if (error) throw new MascotAttemptStoreError();
  return data;
}

export async function reserveAttempt(client: SupabaseClient, userId: string, attemptId: string) {
  const { error } = await client.from("mascot_attempts").upsert({
    user_id: userId,
    attempt_id: attemptId,
    status: "registered" satisfies GenerationJobStatus,
  }, { onConflict: "user_id,attempt_id", ignoreDuplicates: true });
  if (error) throw new MascotAttemptStoreError();
}

export async function saveAttemptJob(client: SupabaseClient, userId: string, job: GenerationJob) {
  const { error } = await client.from("mascot_attempts").upsert({
    user_id: userId,
    attempt_id: job.attemptId,
    modal_job_id: job.id,
    status: job.status,
    selected_master_id: job.approvedMasterId ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,attempt_id" });
  if (error) throw new MascotAttemptStoreError();
}
