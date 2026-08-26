import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { attemptCookie, getAttemptId, getOrCreateAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttempt, findLatestResumableAttempt, isResumableAttemptStatus, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createClient } from "@/lib/supabase/server";
import { createTraceContext, mascotLog, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let trace: MascotTraceContext | undefined;
  try {
    const identity = await requireBrowserIdentity(request);
    const cookieAttemptId = await getAttemptId();
    let attemptId = cookieAttemptId;
    const supabase = identity.mode === "supabase-session" ? await createClient() : null;
    if (supabase) {
      // A browser may retain an obsolete attempt cookie after a failed or
      // canceled start. Prefer it only while it is still resumable; otherwise
      // restore the most recently persisted active birth for this owner.
      const cookieAttempt = cookieAttemptId
        ? await findAttempt(supabase, identity.uid, cookieAttemptId)
        : null;
      const persisted = cookieAttempt && isResumableAttemptStatus(cookieAttempt.status)
        ? cookieAttempt
        : await findLatestResumableAttempt(supabase, identity.uid);
      attemptId = persisted?.attempt_id ?? (cookieAttempt ? crypto.randomUUID() : cookieAttemptId);
    }

    attemptId ??= await getOrCreateAttemptId();
    trace = createTraceContext(attemptId);
    const job = await getMascotGenerationProvider().getJobByAttempt(jobIdentity(identity.uid, attemptId, trace));
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
