import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { findAttemptByJobId } from "./attempt-store";
import { resolveFixtureSource, resolveProviderFixtureSource } from "./fixture-source";
import { getMascotGenerationProvider } from "./provider";
import { jobIdentity } from "./attempt";

const ATTEMPT_ANCHOR_JOB_ID = "job_ad22b714e3547391e9654abf1ece384b";
export const PREVIEW_APPROVED_JOB_ID = "job_43136e0b5283358281bc1d4c6efa8c01";
export const PREVIEW_APPROVED_DISPLAY_NAME = "Mascote GRU";

export class PreviewApprovedJobError extends Error {
  constructor(readonly code: "PREVIEW_APPROVED_JOB_UNAVAILABLE" | "PREVIEW_APPROVED_JOB_BINDING_INVALID") {
    super("O mascote aprovado não está disponível para finalização neste ambiente.");
  }
}

export function isPreviewApprovedJobEnvironment(environment = process.env.VERCEL_ENV) {
  return environment === "preview";
}

export async function resolvePreviewApprovedJobBinding(client: SupabaseClient, userId: string) {
  const attempt = await findAttemptByJobId(client, userId, ATTEMPT_ANCHOR_JOB_ID);
  const source = resolveFixtureSource(attempt, userId, PREVIEW_APPROVED_JOB_ID);
  if (!source) throw new PreviewApprovedJobError("PREVIEW_APPROVED_JOB_UNAVAILABLE");
  const job = await getMascotGenerationProvider().getJob(source.jobId, jobIdentity(userId, source.attemptId));
  const resolved = job ? resolveProviderFixtureSource(source, job) : null;
  if (!resolved) throw new PreviewApprovedJobError("PREVIEW_APPROVED_JOB_BINDING_INVALID");
  return resolved;
}
