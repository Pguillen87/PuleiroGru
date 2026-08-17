import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMascot, GeneratedPose, MascotLibraryItem, PoseRole } from "./types";

type PublicRow = { id: string; source_item_id: string; published_by: string; mascot_code: string; pose_snapshot: GeneratedPose[]; published_at: string; favorite_count: number; save_count: number };

export async function publishMascot(client: SupabaseClient, ownerId: string, item: MascotLibraryItem) {
  const { data, error } = await client.from("mascot_public_mascots").upsert({
    source_item_id: item.id,
    published_by: ownerId,
    mascot_code: item.mascotCode,
    pose_snapshot: item.poses.map(({ id, role, optionId, label }) => ({ id, role, optionId, label })),
  }, { onConflict: "source_item_id" }).select("*").single<PublicRow>();
  if (error || !data) throw new Error("Não foi possível publicar este mascote.");
  return toCommunityMascot(data, new Set(), new Set());
}

export async function unpublishMascot(client: SupabaseClient, ownerId: string, itemId: string) {
  const { error } = await client.from("mascot_public_mascots").delete().eq("source_item_id", itemId).eq("published_by", ownerId);
  if (error) throw new Error("Não foi possível remover este mascote da comunidade.");
}

export async function listCommunityMascots(client: SupabaseClient, userId?: string) {
  const { data, error } = await client.from("mascot_public_mascots").select("*").order("published_at", { ascending: false }).limit(96).returns<PublicRow[]>();
  if (error) throw new Error("Não foi possível abrir a comunidade.");
  const ids = (data ?? []).map((item) => item.id);
  const [favoriteIds, saveIds] = userId
    ? await Promise.all([relationIds(client, "mascot_public_mascot_favorites", userId, ids), relationIds(client, "mascot_public_mascot_saves", userId, ids)])
    : [new Set<string>(), new Set<string>()];
  return (data ?? []).map((item) => toCommunityMascot(item, favoriteIds, saveIds));
}

export async function listPersonalCommunityMascots(client: SupabaseClient, userId: string) {
  const [favoriteIds, saveIds] = await Promise.all([
    relationIds(client, "mascot_public_mascot_favorites", userId, []),
    relationIds(client, "mascot_public_mascot_saves", userId, []),
  ]);
  const ids = [...new Set([...favoriteIds, ...saveIds])];
  if (!ids.length) return [];
  const { data, error } = await client.from("mascot_public_mascots")
    .select("*")
    .in("id", ids)
    .order("published_at", { ascending: false })
    .returns<PublicRow[]>();
  if (error) throw new Error("Não foi possível abrir os mascotes salvos.");
  return (data ?? []).map((item) => toCommunityMascot(item, favoriteIds, saveIds));
}

export async function setCommunityRelation(client: SupabaseClient, table: "mascot_public_mascot_favorites" | "mascot_public_mascot_saves", userId: string, publicMascotId: string, enabled: boolean) {
  if (enabled) {
    const { error } = await client.from(table).upsert({ user_id: userId, public_mascot_id: publicMascotId }, { onConflict: "user_id,public_mascot_id", ignoreDuplicates: true });
    if (error) throw new Error("Não foi possível atualizar sua coleção agora.");
  } else {
    const { error } = await client.from(table).delete().eq("user_id", userId).eq("public_mascot_id", publicMascotId);
    if (error) throw new Error("Não foi possível atualizar sua coleção agora.");
  }
}

export async function findPublicMascot(client: SupabaseClient, id: string) {
  const { data, error } = await client.from("mascot_public_mascots").select("*").eq("id", id).maybeSingle<PublicRow>();
  if (error) throw new Error("Não foi possível abrir o mascote público.");
  return data;
}

async function relationIds(client: SupabaseClient, table: "mascot_public_mascot_favorites" | "mascot_public_mascot_saves", userId: string, ids: string[]) {
  let query = client.from(table).select("public_mascot_id").eq("user_id", userId);
  if (ids.length) query = query.in("public_mascot_id", ids);
  const { data } = await query.returns<Array<{ public_mascot_id: string }>>();
  return new Set((data ?? []).map((item) => item.public_mascot_id));
}

function toCommunityMascot(row: PublicRow, favoriteIds: Set<string>, saveIds: Set<string>): CommunityMascot {
  const poses = row.pose_snapshot.map((pose) => ({ ...pose, imageUrl: `/api/mascot/community/${encodeURIComponent(row.id)}/pose/${encodeURIComponent(pose.role)}?variant=thumb` }));
  return { id: row.id, mascotCode: row.mascot_code, poses, publishedAt: row.published_at, favoriteCount: row.favorite_count, saveCount: row.save_count, isFavorited: favoriteIds.has(row.id), isSaved: saveIds.has(row.id) };
}

export function validPoseRole(value: string): value is PoseRole { return ["normal", "listening", "transcribing"].includes(value); }
