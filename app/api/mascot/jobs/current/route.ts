import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { attemptCookie, getAttemptId, getOrCreateAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttempt, findLatestAttempt, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    const cookieAttemptId = await getAttemptId();
    let attemptId = cookieAttemptId;
    const supabase = identity.mode === "supabase-session" ? await createClient() : null;
    if (supabase) {
      const persisted = cookieAttemptId
        ? await findAttempt(supabase, identity.uid, cookieAttemptId)
        : await findLatestAttempt(supabase, identity.uid);
      attemptId = persisted?.attempt_id ?? cookieAttemptId;
    }

    attemptId ??= await getOrCreateAttemptId();
    const job = await getMascotGenerationProvider().getJobByAttempt(jobIdentity(identity.uid, attemptId));
    if (job && supabase) await saveAttemptJob(supabase, identity.uid, job);
    const response = NextResponse.json({ job }, { status: 200 });
    response.cookies.set(attemptCookie(attemptId));
    return response;
  } catch (error) {
    return integrationErrorResponse(error, "RESUME_FAILED", "Não foi possível retomar o nascimento agora.");
  }
}
