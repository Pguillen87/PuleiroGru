import { NextResponse } from "next/server";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { listCommunityMascots, setCommunityRelation } from "@/lib/mascot-generation/community-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const { itemId } = await context.params;
    const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== "boolean") return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ message: "Entre para salvar na biblioteca." }, { status: 401 });
    const client = createAdminClient();
    if (!client) return NextResponse.json({ message: "A comunidade ainda não está configurada neste ambiente." }, { status: 503 });
    await setCommunityRelation(client, "mascot_public_mascot_saves", identity.uid, itemId, body.enabled);
    const item = (await listCommunityMascots(client, identity.uid)).find((entry) => entry.id === itemId);
    return item ? NextResponse.json({ item }) : NextResponse.json({ message: "Mascote público não encontrado." }, { status: 404 });
  } catch (error) { return authErrorResponse(error) ?? NextResponse.json({ message: "Não foi possível atualizar sua biblioteca." }, { status: 500 }); }
}
