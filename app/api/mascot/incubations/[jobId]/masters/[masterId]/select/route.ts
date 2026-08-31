import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { findAttemptByJobId, projectIncubationJob, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createTraceContext } from "@/lib/observability/mascot-trace";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string; masterId: string }> }) {
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const { jobId, masterId } = await context.params;
    if (!validId(jobId) || !validId(masterId)) return NextResponse.json({ message: "Identificador inválido.", code: "MASTER_SELECTION_INVALID" }, { status: 400 });
    const identity = await requireBrowserIdentity(request);
    const supabase = await createClient();
    const attempt = await findAttemptByJobId(supabase, identity.uid, jobId);
    if (!attempt || attempt.workflow_mode !== "async_incubator_v1") return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    const trace = createTraceContext(attempt.attempt_id, true);
    const provider = getMascotGenerationProvider();
    const job = await provider.selectIncubatorMaster(jobId, masterId, jobIdentity(identity.uid, attempt.attempt_id, trace));
    await saveAttemptJob(supabase, identity.uid, job, trace);
    return NextResponse.json({ job: projectIncubationJob(job, attempt) });
  } catch (error) {
    return integrationErrorResponse(error, "INCUBATION_MASTER_SELECTION_FAILED", "Não foi possível guardar esta escolha agora.");
  }
}
