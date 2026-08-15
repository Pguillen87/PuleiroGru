import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { saveAttemptJob } from "@/lib/mascot-generation/attempt-store";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido.", code: "INVALID_JOB_ID" }, { status: 400 });
  if (!generationConfig.masterGenerationEnabled) {
    return NextResponse.json({ message: "A geração de mascotes está desabilitada neste ambiente.", code: "GENERATION_DISABLED" }, { status: 409 });
  }

  try {
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    const job = await getMascotGenerationProvider().startMasterGeneration(jobId, jobIdentity(identity.uid, attemptId));
    if (identity.mode === "supabase-session") await saveAttemptJob(await createClient(), identity.uid, job);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    console.error("mascot_master_generation_start_failed", { jobId, error: error instanceof Error ? error.name : "unknown" });
    return integrationErrorResponse(error, "MASTER_GENERATION_FAILED", "Não foi possível iniciar o nascimento agora.");
  }
}
