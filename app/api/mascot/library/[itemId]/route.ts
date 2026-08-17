import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { setLibraryItemFavorite } from "@/lib/mascot-generation/library-store";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const validId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  if (!validId(itemId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const body = await request.json().catch(() => null) as { isFavorite?: unknown } | null;
    if (!body || typeof body.isFavorite !== "boolean") {
      return NextResponse.json({ message: "Favorito inválido." }, { status: 400 });
    }
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") {
      return NextResponse.json({ message: "Entre em sua conta para atualizar a biblioteca." }, { status: 401 });
    }
    const item = await setLibraryItemFavorite(await createClient(), identity.uid, itemId, body.isFavorite);
    if (!item) return NextResponse.json({ message: "Mascote não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_UPDATE_FAILED", "Não foi possível atualizar este mascote agora.");
  }
}
