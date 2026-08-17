import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { listLibraryItems } from "@/lib/mascot-generation/library-store";
import { createClient } from "@/lib/supabase/server";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ items: [], total: 0, nextOffset: null });
    const url = new URL(request.url);
    const offset = readInteger(url.searchParams.get("offset"), 0, 10_000);
    const limit = readInteger(url.searchParams.get("limit"), 24, 48);
    const query = (url.searchParams.get("query") ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 32);
    const filter = url.searchParams.get("filter") === "favorites" ? "favorites" : "all";
    const requestedSort = url.searchParams.get("sort");
    const sort = requestedSort === "oldest" || requestedSort === "code" ? requestedSort : "newest";
    const page = await listLibraryItems(await createClient(), identity.uid, {
      offset,
      limit,
      query,
      favoritesOnly: filter === "favorites",
      sort,
    });
    const nextOffset = offset + page.items.length < page.total ? offset + page.items.length : null;
    return NextResponse.json({ items: page.items.map(presentLibraryItem), total: page.total, nextOffset });
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_READ_FAILED", "Não foi possível abrir sua biblioteca agora.");
  }
}

function presentLibraryItem(item: Awaited<ReturnType<typeof listLibraryItems>>["items"][number]) {
  return {
    ...item,
    poses: item.poses.map((pose) => ({
      ...pose,
      imageUrl: `/api/mascot/library/${encodeURIComponent(item.id)}/pose/${encodeURIComponent(pose.role)}?variant=thumb`,
    })),
  };
}

function readInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}
