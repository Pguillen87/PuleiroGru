import { NextResponse } from "next/server";
import { authErrorResponse, optionalBrowserIdentity } from "@/lib/auth/browser-auth";
import { listCommunityMascots } from "@/lib/mascot-generation/community-store";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const identity = await optionalBrowserIdentity(request);
    const client = createAdminClient();
    if (!client) return NextResponse.json({ message: "A comunidade ainda não está configurada neste ambiente." }, { status: 503 });
    return NextResponse.json({ items: await listCommunityMascots(client, identity?.uid) });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ message: "Não foi possível abrir a comunidade." }, { status: 500 });
  }
}
