import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttemptByJobId, projectIncubationJob, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createTraceContext } from "@/lib/observability/mascot-trace";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const identity = await requireBrowserIdentity(request);
    const { jobId } = await params;
    const supabase = await createClient();
    const attempt = await findAttemptByJobId(supabase, identity.uid, jobId);
    if (!attempt || attempt.workflow_mode !== "async_incubator_v1") {
      return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    }
    const trace = createTraceContext(attempt.attempt_id, false);
    const provider = getMascotGenerationProvider();
    const job = await provider.getJob(jobId, jobIdentity(identity.uid, attempt.attempt_id, trace));
    if (!job) return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    await saveAttemptJob(supabase, identity.uid, job, trace);
    return NextResponse.json({ job: projectIncubationJob(job, attempt) });
  } catch (error) {
    return integrationErrorResponse(error, "INCUBATION_READ_FAILED", "Não foi possível abrir este nascimento.");
  }
}
