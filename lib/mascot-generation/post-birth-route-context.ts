import type { SupabaseClient } from "@supabase/supabase-js";
import { findAttemptByJobId, type MascotAttempt } from "./attempt-store";

export function isValidPostBirthJobId(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export async function findHatchedPostBirthAttempt(
  client: SupabaseClient,
  userId: string,
  jobId: string,
): Promise<MascotAttempt | null> {
  const attempt = await findAttemptByJobId(client, userId, jobId);
  if (!attempt || attempt.workflow_mode !== "async_incubator_v1" || !attempt.hatched_at) return null;
  return attempt;
}
