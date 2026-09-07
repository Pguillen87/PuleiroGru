import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizePostBirthDisplayName,
  type PostBirthJournalConfig,
  validateJournalConfig,
} from "./post-birth-validation";

type PostBirthProfileRow = {
  id: string;
  user_id: string;
  attempt_id: string;
  modal_job_id: string;
  state: PostBirthProfileState;
  display_name: string | null;
  journal_config: unknown;
  configuration_revision: number;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
};

export type PostBirthProfileState = "DRAFT" | "ACTIVE";

export type PostBirthProfile = {
  id: string;
  userId: string;
  attemptId: string;
  modalJobId: string;
  state: PostBirthProfileState;
  displayName: string | null;
  journalConfig: PostBirthJournalConfig;
  configurationRevision: number;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
};

export type CreatePostBirthProfileDraftInput = {
  attemptId: string;
  modalJobId: string;
  displayName?: string | null;
  journalConfig?: unknown;
  configurationRevision?: number;
};

export type UpdatePostBirthProfileDraftInput = {
  expectedRevision: number;
  displayName?: string | null;
  journalConfig?: unknown;
};

export type PostBirthStoreErrorCode =
  | "POST_BIRTH_PROFILE_READ_FAILED"
  | "POST_BIRTH_PROFILE_CREATE_FAILED"
  | "POST_BIRTH_PROFILE_UPDATE_FAILED"
  | "POST_BIRTH_PROFILE_ACTIVATE_FAILED"
  | "POST_BIRTH_PROFILE_CONFLICT";

export class PostBirthStoreError extends Error {
  readonly code: PostBirthStoreErrorCode;
  readonly status: 409 | 503;

  constructor(code: PostBirthStoreErrorCode, message = "Não foi possível guardar o perfil pós-nascimento.") {
    super(message);
    this.name = "PostBirthStoreError";
    this.code = code;
    this.status = code === "POST_BIRTH_PROFILE_CONFLICT" ? 409 : 503;
  }
}

export async function findPostBirthProfile(
  client: SupabaseClient,
  userId: string,
  attemptId: string,
): Promise<PostBirthProfile | null> {
  const { data, error } = await client
    .from("mascot_post_birth_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .maybeSingle<PostBirthProfileRow>();

  if (error) throw new PostBirthStoreError("POST_BIRTH_PROFILE_READ_FAILED");
  return data ? toPostBirthProfile(data) : null;
}

export async function createPostBirthProfileDraft(
  client: SupabaseClient,
  userId: string,
  input: CreatePostBirthProfileDraftInput,
): Promise<PostBirthProfile> {
  const displayName = input.displayName == null ? null : normalizePostBirthDisplayName(input.displayName);
  const journalConfig = validateJournalConfig(input.journalConfig ?? { version: 1 });
  const configurationRevision = input.configurationRevision ?? 0;
  assertRevision(configurationRevision);

  const { data, error } = await client
    .from("mascot_post_birth_profiles")
    .insert({
      user_id: userId,
      attempt_id: input.attemptId,
      modal_job_id: input.modalJobId,
      state: "DRAFT",
      display_name: displayName,
      journal_config: journalConfig,
      configuration_revision: configurationRevision,
    })
    .select("*")
    .single<PostBirthProfileRow>();

  if (!error && data) return toPostBirthProfile(data);
  if (error?.code === "23505") {
    const replay = await findPostBirthProfile(client, userId, input.attemptId);
    if (replay) return replay;
    throw new PostBirthStoreError("POST_BIRTH_PROFILE_CONFLICT");
  }
  throw new PostBirthStoreError("POST_BIRTH_PROFILE_CREATE_FAILED");
}

export async function updatePostBirthProfileDraft(
  client: SupabaseClient,
  userId: string,
  attemptId: string,
  input: UpdatePostBirthProfileDraftInput,
): Promise<PostBirthProfile> {
  assertRevision(input.expectedRevision);
  const update: Record<string, unknown> = {
    configuration_revision: input.expectedRevision + 1,
  };
  if (input.displayName !== undefined) {
    update.display_name = input.displayName == null ? null : normalizePostBirthDisplayName(input.displayName);
  }
  if (input.journalConfig !== undefined) update.journal_config = validateJournalConfig(input.journalConfig);

  const { data, error } = await client
    .from("mascot_post_birth_profiles")
    .update(update)
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .eq("state", "DRAFT")
    .eq("configuration_revision", input.expectedRevision)
    .select("*")
    .maybeSingle<PostBirthProfileRow>();

  if (error) throw new PostBirthStoreError("POST_BIRTH_PROFILE_UPDATE_FAILED");
  if (!data) throw new PostBirthStoreError("POST_BIRTH_PROFILE_CONFLICT");
  return toPostBirthProfile(data);
}

export async function activatePostBirthProfile(
  client: SupabaseClient,
  userId: string,
  attemptId: string,
  expectedRevision: number,
): Promise<PostBirthProfile> {
  assertRevision(expectedRevision);
  const { data, error } = await client
    .from("mascot_post_birth_profiles")
    .update({ state: "ACTIVE", activated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .eq("state", "DRAFT")
    .eq("configuration_revision", expectedRevision)
    .select("*")
    .maybeSingle<PostBirthProfileRow>();

  if (error) throw new PostBirthStoreError("POST_BIRTH_PROFILE_ACTIVATE_FAILED");
  if (data) return toPostBirthProfile(data);

  const replay = await findPostBirthProfile(client, userId, attemptId);
  if (replay?.state === "ACTIVE") return replay;
  throw new PostBirthStoreError("POST_BIRTH_PROFILE_CONFLICT");
}

function assertRevision(value: number): asserts value is number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PostBirthStoreError("POST_BIRTH_PROFILE_CONFLICT", "A revisão de configuração é inválida.");
  }
}

function toPostBirthProfile(row: PostBirthProfileRow): PostBirthProfile {
  return {
    id: row.id,
    userId: row.user_id,
    attemptId: row.attempt_id,
    modalJobId: row.modal_job_id,
    state: row.state,
    displayName: row.display_name,
    journalConfig: validateJournalConfig(row.journal_config),
    configurationRevision: row.configuration_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activatedAt: row.activated_at,
  };
}
