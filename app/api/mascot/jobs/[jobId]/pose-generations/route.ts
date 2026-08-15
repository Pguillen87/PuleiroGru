import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { DEFAULT_POSE_CHOICES, POSE_OPTIONS } from "@/lib/mascot-generation/pose-catalog";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { PoseChoices, PoseRole } from "@/lib/mascot-generation/types";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!generationConfig.poseGenerationEnabled) {
    return NextResponse.json({ message: "A geração das poses ainda não foi habilitada.", code: "POSE_GENERATION_DISABLED" }, { status: 409 });
  }
  try {
    const body = await request.json().catch(() => ({})) as { poseChoices?: PoseChoices };
    const poseChoices = validatePoseChoices(body.poseChoices);
    if (!poseChoices) {
      return NextResponse.json({ message: "Escolha uma opção válida para cada função.", code: "INVALID_POSE_CHOICES" }, { status: 400 });
    }
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado." }, { status: 404 });
    const job = await getMascotGenerationProvider().startPoseGeneration(
      jobId,
      poseChoices,
      jobIdentity(identity.uid, attemptId),
    );
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return integrationErrorResponse(error, "POSE_GENERATION_FAILED", "Não foi possível iniciar as poses agora.");
  }
}

function validatePoseChoices(value: PoseChoices | undefined): PoseChoices | null {
  const choices = value ?? DEFAULT_POSE_CHOICES;
  const roles: PoseRole[] = ["normal", "listening", "transcribing"];
  if (Object.keys(choices).length !== roles.length) return null;
  for (const role of roles) {
    if (!POSE_OPTIONS.some((option) => option.role === role && option.id === choices[role])) {
      return null;
    }
  }
  return choices;
}
