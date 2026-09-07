import { NextResponse } from "next/server";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { publishPostBirthMascotPackage, MascotPackageError } from "@/lib/mascot-generation/package-store";
import { MutationRequestRejected, requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";
import { isValidPostBirthJobId } from "@/lib/mascot-generation/post-birth-route-context";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!isValidPostBirthJobId(jobId)) return response("INVALID_JOB_ID", "Identificador inválido.", 400);

  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const identity = await requireBrowserIdentity(request);
    const result = await publishPostBirthMascotPackage(await createClient(), identity.uid, jobId);
    return NextResponse.json({
      package: presentPackage(result.package),
      manifestUrl: result.manifestUrl,
      manifestExpiresIn: result.manifestExpiresIn,
      idempotentReplay: result.idempotentReplay,
    }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    return packageErrorResponse(error);
  }
}

function packageErrorResponse(error: unknown) {
  const auth = authErrorResponse(error);
  if (auth) return auth;
  if (error instanceof MutationRequestRejected) return response(error.code, error.message, 403);
  if (error instanceof MascotPackageError) {
    const message = packageMessages[error.code] ?? "Não foi possível preparar o pacote agora.";
    return response(error.code, message, error.status);
  }
  return response("PACKAGE_PUBLICATION_FAILED", "Não foi possível preparar o pacote agora.", 503);
}

function presentPackage(packageRow: { id: string; package_version: string; status: string }) {
  return { id: packageRow.id, packageVersion: packageRow.package_version, status: packageRow.status };
}

function response(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

const packageMessages: Record<string, string> = {
  POST_BIRTH_PROFILE_NOT_AVAILABLE: "O mascote ainda não está disponível para empacotamento.",
  POST_BIRTH_PROFILE_NOT_FOUND: "Perfil pós-nascimento não encontrado.",
  POST_BIRTH_PROFILE_NOT_ACTIVE: "Ative o perfil pós-nascimento antes de preparar o pacote.",
  DISPLAY_NAME_REQUIRED: "Defina um nome antes de preparar o pacote.",
  ASSET_MISSING: "Uma das poses aprovadas não está disponível.",
  INVALID_CHECKSUM: "Uma das poses aprovadas não passou na verificação de integridade.",
  MANIFEST_INVALID: "O manifesto do pacote não passou na validação.",
  PACKAGE_STORAGE_UNAVAILABLE: "O armazenamento de pacotes está temporariamente indisponível.",
  MANIFEST_SIGNING_FAILED: "Não foi possível assinar o manifesto agora.",
};
