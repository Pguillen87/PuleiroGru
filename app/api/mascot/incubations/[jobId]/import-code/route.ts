import { NextResponse } from "next/server";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { createPostBirthImportCode, ImportCodeError } from "@/lib/mascot-generation/import-store";
import { isValidPostBirthJobId } from "@/lib/mascot-generation/post-birth-route-context";
import { MutationRequestRejected, requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!isValidPostBirthJobId(jobId)) return response("INVALID_JOB_ID", "Identificador inválido.", 400);

  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const identity = await requireBrowserIdentity(request);
    const admin = createAdminClient();
    if (!admin) return response("IMPORT_CODE_STORAGE_UNAVAILABLE", "O serviço de importação está temporariamente indisponível.", 503);
    const code = await createPostBirthImportCode(await createClient(), admin, identity.uid, jobId);
    return NextResponse.json({ code: code.code, packageId: code.packageId, expiresAt: code.expiresAt }, { status: 201 });
  } catch (error) {
    return importCodeErrorResponse(error);
  }
}

function importCodeErrorResponse(error: unknown) {
  const auth = authErrorResponse(error);
  if (auth) return auth;
  if (error instanceof MutationRequestRejected) return response(error.code, error.message, 403);
  if (error instanceof ImportCodeError) {
    return response(error.code, importCodeMessages[error.code], error.status);
  }
  return response("IMPORT_CODE_STORAGE_UNAVAILABLE", "O serviço de importação está temporariamente indisponível.", 503);
}

function response(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

const importCodeMessages: Record<ImportCodeError["code"], string> = {
  IMPORT_CODE_INVALID: "O código de importação é inválido.",
  IMPORT_CODE_EXPIRED: "O código de importação expirou.",
  IMPORT_CODE_REVOKED: "O código de importação foi revogado.",
  IMPORT_PACKAGE_UNAVAILABLE: "O mascote ainda não está disponível para importação.",
  IMPORT_CODE_STORAGE_UNAVAILABLE: "O serviço de importação está temporariamente indisponível.",
};
