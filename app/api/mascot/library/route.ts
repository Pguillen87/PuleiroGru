import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { listLibraryItems } from "@/lib/mascot-generation/library-store";
import { createClient } from "@/lib/supabase/server";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ items: [] });
    const items = await listLibraryItems(await createClient(), identity.uid);
    return NextResponse.json({ items: items.map(presentLibraryItem) });
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_READ_FAILED", "Não foi possível abrir sua biblioteca agora.");
  }
}

function presentLibraryItem(item: Awaited<ReturnType<typeof listLibraryItems>>[number]) {
  return {
    ...item,
    poses: item.poses.map((pose) => ({
      ...pose,
      imageUrl: `/api/mascot/library/${encodeURIComponent(item.id)}/pose/${encodeURIComponent(pose.role)}`,
    })),
  };
}
