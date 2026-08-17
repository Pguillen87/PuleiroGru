import { NextResponse } from "next/server";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { listPersonalCommunityMascots } from "@/lib/mascot-generation/community-store";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ message: "Entre para abrir sua coleção." }, { status: 401 });
    const client = createAdminClient();
    if (!client) return NextResponse.json({ message: "A comunidade ainda não está configurada neste ambiente." }, { status: 503 });
    return NextResponse.json({ items: await listPersonalCommunityMascots(client, identity.uid) });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ message: "Não foi possível abrir sua coleção agora." }, { status: 500 });
  }
}
