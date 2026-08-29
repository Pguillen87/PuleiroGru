import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { assertFinalizationDisplayName, finalizeMascotPackage, isFinalizationPreconditionError, presentFinalizedLibraryItem } from "@/lib/mascot-generation/package-finalization";
import { createClient } from "@/lib/supabase/server";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!validId(jobId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const displayName = await requestDisplayName(request);
    const [identity, attemptId, client] = await Promise.all([requireBrowserIdentity(request), getAttemptId(), createClient()]);
    if (!attemptId) return NextResponse.json({ message: "Nascimento não encontrado." }, { status: 404 });
    if (identity.mode !== "supabase-session") {
      return NextResponse.json({ message: "Entre em sua conta para guardar o mascote.", code: "SESSION_REQUIRED" }, { status: 401 });
    }
    const finalized = await finalizeMascotPackage({ client, userId: identity.uid, attemptId, jobId, displayName });
    return NextResponse.json({ item: presentFinalizedLibraryItem(finalized.item), package: finalized.package }, { status: 201 });
  } catch (error) {
    if (isFinalizationPreconditionError(error)) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 409 });
    }
    return integrationErrorResponse(error, "LIBRARY_SAVE_FAILED", "Não foi possível guardar este mascote agora.");
  }
}

async function requestDisplayName(request: Request) {
  const body = await request.json().catch(() => null) as { displayName?: unknown } | null;
  const displayName = typeof body?.displayName === "string" ? body.displayName : "";
  assertFinalizationDisplayName(displayName);
  return displayName;
}
