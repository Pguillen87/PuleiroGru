import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { attemptCookie, getAttemptId, getOrCreateAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findResumableAttempts, prioritizeAttempt, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createClient } from "@/lib/supabase/server";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";

export const runtime = "nodejs";

async function resumePersistedJob(userId: string, cookieAttemptId: string | undefined) {
  const client = await createClient();
  const attempts = prioritizeAttempt(await findResumableAttempts(client, userId), cookieAttemptId);
  const provider = getMascotGenerationProvider();
  for (const attempt of attempts) {
    const attemptTrace = createTraceContext(attempt.attempt_id);
    const job = await provider.getJobByAttempt(jobIdentity(userId, attempt.attempt_id, attemptTrace));
    if (job) return { attemptId: attempt.attempt_id, job, client, trace: attemptTrace };
    mascotLog("generation_resume_candidate_missing", {
      ...attemptTrace, jobId: attempt.modal_job_id ?? undefined, result: "missing", stage: attempt.status,
    });
  }
  const attemptId = cookieAttemptId ?? await getOrCreateAttemptId();
  return { attemptId, job: null, client, trace: createTraceContext(attemptId) };
}

export async function GET(request: Request) {
  let trace: MascotTraceContext | undefined;
  try {
    const identity = await requireBrowserIdentity(request);
    const cookieAttemptId = await getAttemptId();
    let attemptId = cookieAttemptId ?? await getOrCreateAttemptId();
    let job = null;
    let supabase = null;
    if (identity.mode === "supabase-session") {
      const resumed = await resumePersistedJob(identity.uid, cookieAttemptId);
      ({ attemptId, job, client: supabase, trace } = resumed);
    } else {
      trace = createTraceContext(attemptId);
      job = await getMascotGenerationProvider().getJobByAttempt(jobIdentity(identity.uid, attemptId, trace));
    }
    if (job && supabase) await saveAttemptJob(supabase, identity.uid, job, trace);
    const response = NextResponse.json({ job }, { status: 200 });
    response.cookies.set(attemptCookie(attemptId));
    mascotLog("generation_resumed", { ...trace, jobId: job?.id, result: job ? "found" : "empty", httpStatus: 200, stage: job?.status });
    return traceResponse(response, trace, job?.requestId);
  } catch (error) {
    mascotLog("generation_resume_failed", { ...(trace ?? {}), result: "failure", safeErrorCode: error instanceof Error ? error.name : "UNKNOWN" });
    return integrationErrorResponse(error, "RESUME_FAILED", "Não foi possível retomar o nascimento agora.", trace);
  }
}
