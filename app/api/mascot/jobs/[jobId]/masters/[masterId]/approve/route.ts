import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string; masterId: string }> }) {
  const { jobId, masterId } = await context.params;
  if (!validId(jobId) || !validId(masterId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    const [{ uid }, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    const job = await getMascotGenerationProvider().approveMaster(jobId, masterId, jobIdentity(uid, attemptId));
    return NextResponse.json({ job }, { status: 200 });
  } catch (error) {
    return integrationErrorResponse(error, "APPROVAL_FAILED", "Não foi possível aprovar este mascote agora.");
  }
}
