import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedPose, MascotLibraryItem } from "./types";

type LibraryRow = {
  id: string;
  display_name: string;
  user_id: string;
  attempt_id: string;
  modal_job_id: string;
  master_id: string;
  mascot_code: string;
  pose_snapshot: GeneratedPose[];
  created_at: string;
  is_favorite: boolean;
  favorite_rank: number | null;
};

export type LibrarySort = "newest" | "oldest" | "code";

export type LibraryPageOptions = {
  offset: number;
  limit: number;
  query?: string;
  favoritesOnly?: boolean;
  sort?: LibrarySort;
};

export class MascotLibraryStoreError extends Error {
  constructor(message = "Não foi possível guardar este mascote na biblioteca.") {
    super(message);
  }
}

export async function saveLibraryItem(
  client: SupabaseClient,
  userId: string,
  item: Omit<MascotLibraryItem, "id" | "mascotCode" | "createdAt" | "isFavorite">,
) {
  const existing = await findLibraryItemByJob(client, userId, item.jobId);
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await client.from("mascot_library_items").insert({
      user_id: userId,
      attempt_id: item.attemptId,
      modal_job_id: item.jobId,
      master_id: item.masterId,
      display_name: normalizeDisplayName(item.displayName),
      mascot_code: createMascotCode(),
      pose_snapshot: item.poses,
    }).select("*").single<LibraryRow>();
    if (!error && data) return toLibraryItem(data);
    if (error?.code !== "23505") throw new MascotLibraryStoreError();
    const replay = await findLibraryItemByJob(client, userId, item.jobId);
    if (replay) return replay;
  }
  throw new MascotLibraryStoreError("Não foi possível emitir um código único agora.");
}

export async function findLibraryItemByJob(client: SupabaseClient, userId: string, jobId: string) {
  const { data, error } = await client.from("mascot_library_items")
    .select("*").eq("user_id", userId).eq("modal_job_id", jobId).maybeSingle<LibraryRow>();
  if (error) throw new MascotLibraryStoreError();
  return data ? toLibraryItem(data) : null;
}

export async function findLibraryItem(client: SupabaseClient, userId: string, itemId: string) {
  const { data, error } = await client.from("mascot_library_items")
    .select("*").eq("user_id", userId).eq("id", itemId).maybeSingle<LibraryRow>();
  if (error) throw new MascotLibraryStoreError();
  return data ? toLibraryItem(data) : null;
}

export async function setLibraryItemFavorite(
  client: SupabaseClient,
  userId: string,
  itemId: string,
  isFavorite: boolean,
) {
  const { data, error } = await client.rpc("set_mascot_library_item_favorite", {
    p_item_id: itemId,
    p_is_favorite: isFavorite,
  }).maybeSingle<LibraryRow>();
  if (error) throw new MascotLibraryStoreError();
  return data ? toLibraryItem(data) : null;
}

export async function setLibraryItemFavoriteRank(
  client: SupabaseClient,
  userId: string,
  itemId: string,
  favoriteRank: number,
) {
  if (!Number.isInteger(favoriteRank) || favoriteRank < 1 || favoriteRank > 10_000) {
    throw new MascotLibraryStoreError("Informe uma posição válida para este favorito.");
  }
  const { data, error } = await client.rpc("set_mascot_library_item_favorite_rank", {
    p_item_id: itemId,
    p_favorite_rank: favoriteRank,
  }).maybeSingle<LibraryRow>();
  if (error) throw new MascotLibraryStoreError("Não foi possível reorganizar os favoritos agora.");
  return data ? toLibraryItem(data) : null;
}

export async function setLibraryItemDisplayName(
  client: SupabaseClient,
  userId: string,
  itemId: string,
  displayName: string,
) {
  const { data, error } = await client.from("mascot_library_items")
    .update({ display_name: normalizeDisplayName(displayName) })
    .eq("user_id", userId)
    .eq("id", itemId)
    .select("*")
    .maybeSingle<LibraryRow>();
  if (error) throw new MascotLibraryStoreError("Não foi possível alterar o nome agora.");
  return data ? toLibraryItem(data) : null;
}

export async function deleteLibraryItem(client: SupabaseClient, userId: string, itemId: string) {
  const { data, error } = await client.from("mascot_library_items")
    .delete()
    .eq("user_id", userId)
    .eq("id", itemId)
    .select("id")
    .maybeSingle();
  if (error) throw new MascotLibraryStoreError("Não foi possível excluir este mascote agora.");
  return Boolean(data);
}

export async function listLibraryItems(client: SupabaseClient, userId: string, options?: LibraryPageOptions) {
  let request = client.from("mascot_library_items")
    .select("*", { count: "exact" })
    .eq("user_id", userId);
  if (options?.favoritesOnly) request = request.eq("is_favorite", true);
  if (options?.query) request = request.ilike("mascot_code", `%${options.query}%`);
  const sort = options?.sort ?? "newest";
  request = request
    .order("is_favorite", { ascending: false })
    .order("favorite_rank", { ascending: true, nullsFirst: false })
    .order(sort === "code" ? "mascot_code" : "created_at", { ascending: sort === "oldest" || sort === "code" });
  if (options) request = request.range(options.offset, options.offset + options.limit - 1);
  const { data, error, count } = await request.returns<LibraryRow[]>();
  if (error) throw new MascotLibraryStoreError();
  const items = (data ?? []).map(toLibraryItem);
  return { items, total: count ?? items.length };
}

function toLibraryItem(row: LibraryRow): MascotLibraryItem {
  return {
    id: row.id,
    displayName: row.display_name,
    mascotCode: row.mascot_code,
    jobId: row.modal_job_id,
    attemptId: row.attempt_id,
    masterId: row.master_id,
    poses: row.pose_snapshot,
    createdAt: row.created_at,
    isFavorite: row.is_favorite,
    favoriteRank: row.favorite_rank ?? undefined,
  };
}

function normalizeDisplayName(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 32);
  if (normalized.length < 2) throw new MascotLibraryStoreError("Informe um nome de 2 a 32 caracteres para o mascote.");
  return normalized;
}

function createMascotCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const groups = [0, 4].map((offset) => Array.from(bytes.subarray(offset, offset + 4), (value) => alphabet[value % alphabet.length]).join(""));
  return `GRU-${groups[0]}-${groups[1]}`;
}
