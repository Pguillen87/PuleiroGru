import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { createClient } from "@/lib/supabase/server";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";
import { publishMascotPackage, MascotPackageError } from "@/lib/mascot-generation/package-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ code: "SESSION_REQUIRED" }, { status: 401 });
    const { itemId } = await context.params;
    const result = await publishMascotPackage(await createClient(), identity.uid, itemId);
    return NextResponse.json({ code: result.item.mascotCode, package: result.package }, { status: 201 });
  } catch (error) {
    if (error instanceof MascotPackageError) return NextResponse.json({ code: error.code, message: error.message }, { status: 409 });
    return NextResponse.json({ code: "PACKAGE_PUBLICATION_FAILED", message: "Não foi possível preparar a instalação agora." }, { status: 500 });
  }
}
