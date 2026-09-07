import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import {
  activatePostBirthProfile,
  findPostBirthProfile,
} from "@/lib/mascot-generation/post-birth-store";
import { postBirthErrorResponse } from "@/lib/mascot-generation/post-birth-api-errors";
import { findHatchedPostBirthAttempt, isValidPostBirthJobId } from "@/lib/mascot-generation/post-birth-route-context";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!isValidPostBirthJobId(jobId)) return response("INVALID_JOB_ID", "Identificador inválido.", 400);

  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const body = await readActivationBody(request);
    if (!body) return response("INVALID_REQUEST", "Envie uma ativação válida.", 400);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey !== null && !isValidIdempotencyKey(idempotencyKey)) {
      return response("INVALID_IDEMPOTENCY_KEY", "A chave de idempotência é inválida.", 400);
    }

    const identity = await requireBrowserIdentity(request);
    const client = await createClient();
    const attempt = await findHatchedPostBirthAttempt(client, identity.uid, jobId);
    if (!attempt) return response("POST_BIRTH_PROFILE_NOT_AVAILABLE", "O perfil só está disponível após o nascimento.", 404);

    const current = await findPostBirthProfile(client, identity.uid, attempt.attempt_id);
    if (!current) return response("POST_BIRTH_PROFILE_NOT_FOUND", "Perfil pós-nascimento não encontrado.", 404);
    if (current.state === "ACTIVE") return NextResponse.json({ profile: current, idempotentReplay: true });
    if (!current.displayName) return response("DISPLAY_NAME_REQUIRED", "Defina um nome antes de ativar o mascote.", 400);

    const configurationRevision = body.configurationRevision;
    if (!Number.isInteger(configurationRevision) || (configurationRevision as number) < 0) {
      return response("CONFIGURATION_REVISION_REQUIRED", "A versão da configuração é obrigatória.", 400);
    }

    const profile = await activatePostBirthProfile(client, identity.uid, attempt.attempt_id, configurationRevision as number);
    return NextResponse.json({ profile, idempotentReplay: false });
  } catch (error) {
    return postBirthErrorResponse(error, "POST_BIRTH_PROFILE_ACTIVATE_FAILED", "Não foi possível ativar o perfil pós-nascimento agora.");
  }
}

async function readActivationBody(request: Request): Promise<{ configurationRevision?: unknown } | null> {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const allowed = new Set(["configurationRevision"]);
  return Object.keys(body).every((key) => allowed.has(key)) ? body as { configurationRevision?: unknown } : null;
}

function isValidIdempotencyKey(value: string) {
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 128 && !/[\u0000-\u001f\u007f]/.test(normalized);
}

function response(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}
