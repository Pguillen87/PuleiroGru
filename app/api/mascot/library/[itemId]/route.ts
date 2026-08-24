import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { deleteLibraryItem, setLibraryItemDisplayName, setLibraryItemFavorite, setLibraryItemFavoriteRank } from "@/lib/mascot-generation/library-store";
import { refreshPackageDisplayName } from "@/lib/mascot-generation/package-store";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const validId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  if (!validId(itemId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const body = await request.json().catch(() => null) as { isFavorite?: unknown; displayName?: unknown; favoriteRank?: unknown } | null;
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") {
      return NextResponse.json({ message: "Entre em sua conta para atualizar a biblioteca." }, { status: 401 });
    }
    const client = await createClient();
    const displayName = typeof body?.displayName === "string" ? body.displayName : null;
    const favoriteRank = body?.favoriteRank;
    const isRenaming = displayName !== null;
    const isReorderingFavorite = typeof favoriteRank === "number";
    const updateCount = Number(typeof body?.isFavorite === "boolean") + Number(isRenaming) + Number(isReorderingFavorite);
    if (updateCount !== 1) {
      return NextResponse.json({ message: "Envie uma única atualização por vez." }, { status: 400 });
    }
    if (isReorderingFavorite && (!Number.isInteger(favoriteRank) || favoriteRank < 1 || favoriteRank > 10_000)) {
      return NextResponse.json({ message: "Informe uma posição entre 1 e 10.000." }, { status: 400 });
    }
    const item = typeof body?.isFavorite === "boolean"
      ? await setLibraryItemFavorite(client, identity.uid, itemId, body.isFavorite)
      : isRenaming
        ? await setLibraryItemDisplayName(client, identity.uid, itemId, displayName)
        : await setLibraryItemFavoriteRank(client, identity.uid, itemId, favoriteRank as number);
    if (!item) return NextResponse.json({ message: "Mascote não encontrado." }, { status: 404 });
    if (isRenaming) await refreshPackageDisplayName(identity.uid, item.id, item.displayName);
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
