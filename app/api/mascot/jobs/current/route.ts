import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const [{ uid }, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ job: null }, { status: 200 });
    const job = await getMascotGenerationProvider().getJobByAttempt(jobIdentity(uid, attemptId));
    return NextResponse.json({ job }, { status: 200 });
  } catch (error) {
    return integrationErrorResponse(error, "RESUME_FAILED", "Não foi possível retomar o nascimento agora.");
  }
}
