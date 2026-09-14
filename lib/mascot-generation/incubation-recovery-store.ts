import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IncubationRecoveryStatus = "CONFIRMED_MISSING" | "RETIRED";

export type IncubationRecovery = {
  id: string;
  userId: string;
  attemptId: string;
  modalJobId: string;
  status: IncubationRecoveryStatus;
  errorCode: string;
  firstObservedAt: string;
  lastObservedAt: string;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RecoveryRow = {
  id: string;
  user_id: string;
  attempt_id: string;
  modal_job_id: string;
  status: IncubationRecoveryStatus;
  error_code: string;
  first_observed_at: string;
  last_observed_at: string;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

export class IncubationRecoveryStoreError extends Error {
  constructor(message = "Não foi possível consultar a recuperação do nascimento.", readonly code = "INCUBATION_RECOVERY_UNAVAILABLE", readonly status: 409 | 503 = 503) {
    super(message);
  }
}

export async function findIncubationRecovery(client: SupabaseClient, userId: string, attemptId: string) {
  const { data, error } = await client.from("mascot_incubation_recovery")
    .select("*").eq("user_id", userId).eq("attempt_id", attemptId).maybeSingle<RecoveryRow>();
  if (error) throw new IncubationRecoveryStoreError();
  return data ? toRecovery(data) : null;
}

export async function listIncubationRecoveries(client: SupabaseClient, userId: string, attemptIds: string[]) {
  if (attemptIds.length === 0) return new Map<string, IncubationRecovery>();
  const { data, error } = await client.from("mascot_incubation_recovery")
    .select("*").eq("user_id", userId).in("attempt_id", attemptIds).returns<RecoveryRow[]>();
  if (error) throw new IncubationRecoveryStoreError();
  return new Map((data ?? []).map((row) => [row.attempt_id, toRecovery(row)]));
}

export async function markIncubationJobMissing(client: SupabaseClient, userId: string, attemptId: string, modalJobId: string) {
  const now = new Date().toISOString();
  const existing = await findIncubationRecovery(client, userId, attemptId);
  if (existing?.status === "RETIRED") return existing;
  if (existing) {
    const { data, error } = await client.from("mascot_incubation_recovery").update({
      modal_job_id: modalJobId,
      last_observed_at: now,
      updated_at: now,
    }).eq("user_id", userId).eq("attempt_id", attemptId).select("*").single<RecoveryRow>();
    if (error || !data) throw new IncubationRecoveryStoreError("Não foi possível registrar a recuperação do nascimento.");
    return toRecovery(data);
  }
  const { data, error } = await client.from("mascot_incubation_recovery").insert({
    user_id: userId,
    attempt_id: attemptId,
    modal_job_id: modalJobId,
    status: "CONFIRMED_MISSING" satisfies IncubationRecoveryStatus,
    error_code: "INCUBATION_JOB_GONE",
    first_observed_at: now,
    last_observed_at: now,
    updated_at: now,
  }).select("*").single<RecoveryRow>();
  if (!error && data) return toRecovery(data);
  if (error?.code === "23505") {
    const raced = await findIncubationRecovery(client, userId, attemptId);
    if (raced) return raced;
  }
  throw new IncubationRecoveryStoreError("Não foi possível registrar a recuperação do nascimento.");
}

export async function retireIncubationAttempt(
  client: SupabaseClient,
  userId: string,
  attemptId: string,
  modalJobId: string,
  errorCode = "INCUBATION_JOB_GONE",
) {
  const now = new Date().toISOString();
  const existing = await findIncubationRecovery(client, userId, attemptId);
  if (existing?.status === "RETIRED") return existing;
  if (existing) {
    const { data, error } = await client.from("mascot_incubation_recovery").update({
      status: "RETIRED" satisfies IncubationRecoveryStatus,
      retired_at: now,
      updated_at: now,
    }).eq("user_id", userId).eq("attempt_id", attemptId).eq("modal_job_id", modalJobId).select("*").maybeSingle<RecoveryRow>();
    if (error || !data) throw new IncubationRecoveryStoreError("Não foi possível retirar este nascimento agora.");
    return toRecovery(data);
  }
  const { data, error } = await client.from("mascot_incubation_recovery").insert({
    user_id: userId,
    attempt_id: attemptId,
    modal_job_id: modalJobId,
    status: "RETIRED" satisfies IncubationRecoveryStatus,
    error_code: errorCode,
    first_observed_at: now,
    last_observed_at: now,
    retired_at: now,
    updated_at: now,
  }).select("*").single<RecoveryRow>();
  if (!error && data) return toRecovery(data);
  if (error?.code === "23505") {
    const raced = await findIncubationRecovery(client, userId, attemptId);
    if (raced?.status === "RETIRED") return raced;
  }
  throw new IncubationRecoveryStoreError("Não foi possível retirar este nascimento agora.");
}

function toRecovery(row: RecoveryRow): IncubationRecovery {
  return {
    id: row.id,
    userId: row.user_id,
    attemptId: row.attempt_id,
    modalJobId: row.modal_job_id,
    status: row.status,
    errorCode: row.error_code,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at,
    retiredAt: row.retired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
