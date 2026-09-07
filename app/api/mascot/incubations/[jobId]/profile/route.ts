import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import {
  findPostBirthProfile,
  updatePostBirthProfileDraft,
} from "@/lib/mascot-generation/post-birth-store";
import { postBirthErrorResponse } from "@/lib/mascot-generation/post-birth-api-errors";
import { findHatchedPostBirthAttempt, isValidPostBirthJobId } from "@/lib/mascot-generation/post-birth-route-context";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ProfilePatchBody = {
  configurationRevision?: unknown;
  display_name?: unknown;
  journal_config?: unknown;
};

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!isValidPostBirthJobId(jobId)) return invalidJobResponse();

  try {
    const identity = await requireBrowserIdentity(_request);
    const client = await createClient();
    const attempt = await findHatchedPostBirthAttempt(client, identity.uid, jobId);
    if (!attempt) return unavailableResponse();

    const profile = await findPostBirthProfile(client, identity.uid, attempt.attempt_id);
    if (!profile) return profileNotFoundResponse();
    return NextResponse.json({ profile });
  } catch (error) {
    return postBirthErrorResponse(error, "POST_BIRTH_PROFILE_READ_FAILED", "Não foi possível abrir o perfil pós-nascimento agora.");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!isValidPostBirthJobId(jobId)) return invalidJobResponse();

  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const body = await readPatchBody(request);
    if (!body) return invalidPayloadResponse();

    const identity = await requireBrowserIdentity(request);
    const client = await createClient();
    const attempt = await findHatchedPostBirthAttempt(client, identity.uid, jobId);
    if (!attempt) return unavailableResponse();

    const current = await findPostBirthProfile(client, identity.uid, attempt.attempt_id);
    if (!current) return profileNotFoundResponse();
    if (current.state === "ACTIVE") {
      return NextResponse.json({ code: "POST_BIRTH_PROFILE_ACTIVE", message: "Este perfil já está ativo." }, { status: 409 });
    }

    const configurationRevision = body.configurationRevision;
    if (!Number.isInteger(configurationRevision) || (configurationRevision as number) < 0) {
      return NextResponse.json({ code: "CONFIGURATION_REVISION_REQUIRED", message: "A versão da configuração é obrigatória." }, { status: 400 });
    }

    const hasDisplayName = Object.hasOwn(body, "display_name");
    const hasJournalConfig = Object.hasOwn(body, "journal_config");
    if (!hasDisplayName && !hasJournalConfig) return invalidPayloadResponse();
    if (hasDisplayName && body.display_name !== null && typeof body.display_name !== "string") return invalidPayloadResponse();
    if (hasJournalConfig && body.journal_config === undefined) return invalidPayloadResponse();

    const profile = await updatePostBirthProfileDraft(client, identity.uid, attempt.attempt_id, {
      expectedRevision: configurationRevision as number,
      ...(hasDisplayName ? { displayName: body.display_name as string | null } : {}),
      ...(hasJournalConfig ? { journalConfig: body.journal_config } : {}),
    });
    return NextResponse.json({ profile });
  } catch (error) {
    return postBirthErrorResponse(error, "POST_BIRTH_PROFILE_UPDATE_FAILED", "Não foi possível atualizar o perfil pós-nascimento agora.");
  }
}

async function readPatchBody(request: Request): Promise<ProfilePatchBody | null> {
  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return null;
  const allowed = new Set(["configurationRevision", "display_name", "journal_config"]);
  return Object.keys(body).every((key) => allowed.has(key)) ? body : null;
}

function isRecord(value: unknown): value is ProfilePatchBody {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidJobResponse() {
  return NextResponse.json({ code: "INVALID_JOB_ID", message: "Identificador inválido." }, { status: 400 });
}

function invalidPayloadResponse() {
  return NextResponse.json({ code: "INVALID_REQUEST", message: "Envie uma atualização válida." }, { status: 400 });
}

function unavailableResponse() {
  return NextResponse.json({ code: "POST_BIRTH_PROFILE_NOT_AVAILABLE", message: "O perfil só está disponível após o nascimento." }, { status: 404 });
}

function profileNotFoundResponse() {
  return NextResponse.json({ code: "POST_BIRTH_PROFILE_NOT_FOUND", message: "Perfil pós-nascimento não encontrado." }, { status: 404 });
}
