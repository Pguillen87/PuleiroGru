import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { deleteLibraryItem, setLibraryItemDisplayName, setLibraryItemFavorite } from "@/lib/mascot-generation/library-store";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const validId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  if (!validId(itemId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const body = await request.json().catch(() => null) as { isFavorite?: unknown; displayName?: unknown } | null;
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") {
      return NextResponse.json({ message: "Entre em sua conta para atualizar a biblioteca." }, { status: 401 });
    }
    const client = await createClient();
    const item = typeof body?.isFavorite === "boolean"
      ? await setLibraryItemFavorite(client, identity.uid, itemId, body.isFavorite)
      : typeof body?.displayName === "string"
        ? await setLibraryItemDisplayName(client, identity.uid, itemId, body.displayName)
        : null;
    if (typeof body?.isFavorite !== "boolean" && typeof body?.displayName !== "string") {
      return NextResponse.json({ message: "Atualização inválida." }, { status: 400 });
    }
    if (!item) return NextResponse.json({ message: "Mascote não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_UPDATE_FAILED", "Não foi possível atualizar este mascote agora.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  if (!validId(itemId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ message: "Entre em sua conta para excluir um mascote." }, { status: 401 });
    const deleted = await deleteLibraryItem(await createClient(), identity.uid, itemId);
    if (!deleted) return NextResponse.json({ message: "Mascote não encontrado." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_DELETE_FAILED", "Não foi possível excluir este mascote agora.");
  }
}
