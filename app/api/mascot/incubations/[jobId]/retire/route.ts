import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { findAttemptByJobId } from "@/lib/mascot-generation/attempt-store";
import { findIncubationRecovery, IncubationRecoveryStoreError, retireIncubationAttempt } from "@/lib/mascot-generation/incubation-recovery-store";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const identity = await requireBrowserIdentity(request);
    const { jobId } = await params;
    const client = await createClient();
    const attempt = await findAttemptByJobId(client, identity.uid, jobId);
    if (!attempt || attempt.workflow_mode !== "async_incubator_v1") {
      return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    }
    const recovery = await findIncubationRecovery(client, identity.uid, attempt.attempt_id);
    if (recovery?.status === "RETIRED") return NextResponse.json({ retired: true, idempotentReplay: true });
    const failed = attempt.status === "failed" && !attempt.hatched_at;
    const confirmedMissing = recovery?.status === "CONFIRMED_MISSING";
    if (!failed && !confirmedMissing) {
      return NextResponse.json({ message: "Só é possível remover nascimentos que falharam ou perderam o vínculo com o processamento.", code: "INCUBATION_RETIRE_NOT_ALLOWED" }, { status: 409 });
    }
    const admin = createAdminClient();
    if (!admin) throw new IncubationRecoveryStoreError("A retirada do nascimento não está configurada.");
    if (failed) {
      await retireIncubationAttempt(admin, identity.uid, attempt.attempt_id, jobId, attempt.last_error_code ?? "INCUBATION_FAILED");
    } else {
      await retireIncubationAttempt(admin, identity.uid, attempt.attempt_id, jobId);
    }
    return NextResponse.json({ retired: true, idempotentReplay: false });
  } catch (error) {
    return integrationErrorResponse(error, "INCUBATION_RETIRE_FAILED", "Não foi possível retirar este nascimento agora.");
  }
}
