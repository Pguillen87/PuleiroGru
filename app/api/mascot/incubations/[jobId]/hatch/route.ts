import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { attemptCookie, jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttemptByJobId, markAttemptHatched } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createTraceContext } from "@/lib/observability/mascot-trace";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const identity = await requireBrowserIdentity(request);
    const { jobId } = await params;
    const supabase = await createClient();
    const attempt = await findAttemptByJobId(supabase, identity.uid, jobId);
    if (!attempt || attempt.workflow_mode !== "async_incubator_v1") {
      return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    }
    const provider = getMascotGenerationProvider();
    const job = await provider.getJob(jobId, jobIdentity(identity.uid, attempt.attempt_id, createTraceContext(attempt.attempt_id, true)));
    if (!job || job.status !== "awaiting_set_approval" || job.poses.length !== 3 || job.poseSetQc?.status !== "passed") {
      return NextResponse.json({ message: "Este ovo ainda não está pronto para chocar.", code: "GENERATION_NOT_READY" }, { status: 409 });
    }
    const hatchedAt = attempt.hatched_at ?? await markAttemptHatched(supabase, identity.uid, attempt.attempt_id, jobId);
    const response = NextResponse.json({ job: { ...job, productState: "HATCHED", hatchedAt } });
    response.cookies.set(attemptCookie(attempt.attempt_id));
    return response;
  } catch (error) {
    return integrationErrorResponse(error, "INCUBATION_HATCH_FAILED", "Não foi possível chocar este ovo.");
  }
}
