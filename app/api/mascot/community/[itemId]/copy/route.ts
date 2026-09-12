import { NextResponse } from "next/server";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { createPublicMascotCopy, MascotCopyError } from "@/lib/mascot-generation/community-copy-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return response("SESSION_REQUIRED", "Entre para guardar uma cópia na sua biblioteca.", 401);
    const body = await readBody(request);
    if (!body) return response("INVALID_REQUEST", "Envie um nome válido para a cópia.", 400);
    const { itemId } = await context.params;
    const admin = createAdminClient();
    if (!admin) return response("PUBLIC_MASCOT_COPY_UNAVAILABLE", "A cópia ainda não está configurada neste ambiente.", 503);
    const result = await createPublicMascotCopy(admin, identity.uid, itemId, body.displayName);
    return NextResponse.json({ item: result.item, sourcePublicMascotId: result.sourcePublicMascotId, idempotentReplay: result.idempotentReplay }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof MascotCopyError) return response(error.code, error.message, error.status);
    return response("PUBLIC_MASCOT_COPY_UNAVAILABLE", "Não foi possível guardar este mascote agora.", 503);
  }
}

async function readBody(request: Request): Promise<{ displayName?: string } | null> {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "displayName")) return null;
  if ("displayName" in body && typeof body.displayName !== "string") return null;
  return body as { displayName?: string };
}

function response(code: string, message: string, status: number) { return NextResponse.json({ code, message }, { status }); }
