import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { jobIdentity } from "@/lib/mascot-generation/attempt";
import { findLibraryItem } from "@/lib/mascot-generation/library-store";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { PoseRole } from "@/lib/mascot-generation/types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validRoles = new Set<PoseRole>(["normal", "listening", "transcribing"]);

export async function GET(request: Request, context: { params: Promise<{ itemId: string; role: string }> }) {
  const { itemId, role } = await context.params;
  if (!validId(itemId) || !validRoles.has(role as PoseRole)) return new NextResponse(null, { status: 404 });
  try {
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return new NextResponse(null, { status: 401 });
    const item = await findLibraryItem(await createClient(), identity.uid, itemId);
    if (!item) return new NextResponse(null, { status: 404 });
    const image = await getMascotGenerationProvider().getPoseImage?.(
      item.jobId,
      role as PoseRole,
      jobIdentity(identity.uid, item.attemptId),
    );
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(image.bytes), {
      headers: { "Content-Type": image.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_ASSET_READ_FAILED", "Imagem indisponível.");
  }
}
