import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { listLibraryItems } from "@/lib/mascot-generation/library-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import type { MascotLibraryItem } from "@/lib/mascot-generation/types";

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
    const admin = createAdminClient();
    const packageStates = admin ? await readFinalizationStates(admin, identity.uid, page.items) : new Map<string, MascotLibraryItem["finalization"]>();
    const publicIds = admin && page.items.length
      ? new Set((await admin.from("mascot_public_mascots").select("source_item_id").in("source_item_id", page.items.map((item) => item.id))).data?.map((row: { source_item_id: string }) => row.source_item_id) ?? [])
      : new Set<string>();
    const decorated = page.items.map((item) => ({ ...item, finalization: packageStates.get(item.id) ?? { state: "not_started" as const } }));
    const items = decorated.filter((item) => item.finalization?.state === "ready");
    const pendingItems = decorated.filter((item) => item.finalization?.state !== "ready");
    return NextResponse.json({ items: items.map((item) => presentLibraryItem(item, publicIds.has(item.id))), pendingItems: pendingItems.map((item) => presentLibraryItem(item, false)), total: page.total, nextOffset });
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_READ_FAILED", "Não foi possível abrir sua biblioteca agora.");
  }
}

async function readFinalizationStates(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string, items: Awaited<ReturnType<typeof listLibraryItems>>["items"]) {
  const states = new Map<string, MascotLibraryItem["finalization"]>();
  if (!items.length) return states;
  const itemIds = items.map((item) => item.id);
  const jobIds = items.map((item) => item.jobId);
  const [{ data: packages }, { data: attempts }] = await Promise.all([
    admin.from("mascot_packages").select("library_item_id, status").eq("user_id", userId).in("library_item_id", itemIds),
    admin.from("mascot_attempts").select("modal_job_id, status, operation_id, last_error_code").eq("user_id", userId).in("modal_job_id", jobIds),
  ]);
  const attemptsByJob = new Map((attempts ?? []).map((attempt: { modal_job_id: string; status: string; operation_id: string | null; last_error_code: string | null }) => [attempt.modal_job_id, attempt]));
  for (const item of items) {
    const packageRow = (packages ?? []).find((entry: { library_item_id: string }) => entry.library_item_id === item.id) as { status: string } | undefined;
    const attempt = attemptsByJob.get(item.jobId);
    const state = packageRow?.status === "ready" ? "ready" : packageRow?.status === "pending" || attempt?.status === "packaging" ? "packaging" : attempt?.status === "failed" ? "failed" : "not_started";
    states.set(item.id, { state, operationId: attempt?.operation_id ?? undefined, errorCode: attempt?.last_error_code ?? undefined });
  }
  return states;
}

function presentLibraryItem(item: Awaited<ReturnType<typeof listLibraryItems>>["items"][number], isPublic: boolean) {
  return {
    ...item,
    isPublic,
    poses: item.poses.map((pose) => ({
      ...pose,
      imageUrl: `/api/mascot/library/${encodeURIComponent(item.id)}/pose/${encodeURIComponent(pose.role)}?variant=thumb&v=5`,
    })),
  };
}

function readInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}
