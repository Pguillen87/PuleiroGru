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
      const persisted = cookieAttemptId
        ? await findAttempt(supabase, identity.uid, cookieAttemptId)
        : await findLatestResumableAttempt(supabase, identity.uid);
      attemptId = persisted && isResumableAttemptStatus(persisted.status)
        ? persisted.attempt_id
        : persisted
          ? crypto.randomUUID()
          : cookieAttemptId;
    }

    attemptId ??= await getOrCreateAttemptId();
    trace = createTraceContext(attemptId);
    const job = await getMascotGenerationProvider().getJobByAttempt(jobIdentity(identity.uid, attemptId, trace));
    if (job && supabase) await saveAttemptJob(supabase, identity.uid, job);
    const response = NextResponse.json({ job }, { status: 200 });
    response.cookies.set(attemptCookie(attemptId));
    mascotLog("pose_operation_resumed", { ...trace, jobId: job?.id, result: job ? "found" : "empty", httpStatus: 200 });
    return traceResponse(response, trace, job?.requestId);
  } catch (error) {
    mascotLog("pose_operation_resume_failed", { ...(trace ?? {}), result: "failure", safeErrorCode: error instanceof Error ? error.name : "UNKNOWN" });
    return integrationErrorResponse(error, "RESUME_FAILED", "Não foi possível retomar o nascimento agora.", trace);
  }
}
