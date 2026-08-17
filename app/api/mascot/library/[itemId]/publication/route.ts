import { NextResponse } from "next/server";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { publishMascot, unpublishMascot } from "@/lib/mascot-generation/community-store";
import { findLibraryItem } from "@/lib/mascot-generation/library-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const { itemId } = await context.params;
    const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== "boolean") return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ message: "Entre para publicar um mascote." }, { status: 401 });
    const item = await findLibraryItem(await createClient(), identity.uid, itemId);
    if (!item) return NextResponse.json({ message: "Mascote não encontrado." }, { status: 404 });
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ message: "A publicação ainda não está configurada neste ambiente." }, { status: 503 });
    if (!body.enabled) { await unpublishMascot(admin, identity.uid, item.id); return NextResponse.json({ published: false }); }
    const publicItem = await publishMascot(admin, identity.uid, item);
    return NextResponse.json({ published: true, item: publicItem });
  } catch (error) { return authErrorResponse(error) ?? NextResponse.json({ message: "Não foi possível atualizar a publicação." }, { status: 500 }); }
}
