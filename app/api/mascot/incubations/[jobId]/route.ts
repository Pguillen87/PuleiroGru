import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { jobIdentity } from "@/lib/mascot-generation/attempt";
import { findAttemptByJobId, projectIncubationJob, saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { lookupIncubationJob, safeIncubationJobId } from "@/lib/mascot-generation/incubation-recovery";
import { IncubationRecoveryStoreError, markIncubationJobMissing, findIncubationRecovery } from "@/lib/mascot-generation/incubation-recovery-store";
import { createTraceContext, mascotLog } from "@/lib/observability/mascot-trace";
import { createAdminClient } from "@/lib/supabase/admin";
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
    const recovery = await findIncubationRecovery(supabase, identity.uid, attempt.attempt_id);
    if (recovery?.status === "RETIRED") {
      return NextResponse.json({ message: "Este nascimento foi retirado da Incubadora.", code: "INCUBATION_RETIRED" }, { status: 410 });
    }
    if (recovery?.status === "CONFIRMED_MISSING") {
      return NextResponse.json({ message: "Este nascimento perdeu o vínculo com o processamento.", code: "INCUBATION_JOB_GONE" }, { status: 410 });
    }
    const lookup = await lookupIncubationJob(provider, jobId, jobIdentity(identity.uid, attempt.attempt_id, trace));
    if (lookup.kind === "not_found") {
      mascotLog("incubation_job_unavailable", { jobId: safeIncubationJobId(jobId), result: "failure", safeErrorCode: "INCUBATION_JOB_GONE", httpStatus: 410, stage: attempt.status });
      const admin = createAdminClient();
      if (!admin) throw new IncubationRecoveryStoreError("A recuperação do nascimento não está configurada.");
      const missing = await markIncubationJobMissing(admin, identity.uid, attempt.attempt_id, jobId);
      if (missing.status === "RETIRED") {
        return NextResponse.json({ message: "Este nascimento foi retirado da Incubadora.", code: "INCUBATION_RETIRED" }, { status: 410 });
      }
      return NextResponse.json({ message: "Este nascimento perdeu o vínculo com o processamento.", code: missing.errorCode }, { status: 410 });
    }
    if (lookup.kind === "unavailable") {
      mascotLog("incubation_job_unavailable", { jobId: safeIncubationJobId(jobId), result: "failure", safeErrorCode: "INCUBATION_PROVIDER_UNAVAILABLE", httpStatus: 503, stage: attempt.status });
      throw lookup.error;
    }
    const job = lookup.job;
    await saveAttemptJob(supabase, identity.uid, job, trace);
    return NextResponse.json({ job: projectIncubationJob(job, attempt) });
  } catch (error) {
    return integrationErrorResponse(error, "INCUBATION_READ_FAILED", "Não foi possível abrir este nascimento.");
  }
}
