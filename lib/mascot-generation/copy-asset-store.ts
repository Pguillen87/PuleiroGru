import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcceptedImageType, PoseRole } from "./types";

export type StoredCopyAsset = {
  role: PoseRole;
  storagePath: string;
  sha256: string;
  expectedBytes: number;
  mimeType: AcceptedImageType;
  bytes: Uint8Array;
};

type CopyAssetRow = {
  library_item_id: string;
  user_id: string;
  role: PoseRole;
  storage_path: string;
  sha256: string;
  expected_bytes: number;
  mime_type: AcceptedImageType;
};

export async function readCopiedPoseAsset(
  admin: SupabaseClient,
  userId: string,
  itemId: string,
  role: PoseRole,
) {
  const { data, error } = await admin.from("mascot_library_item_assets")
    .select("library_item_id, user_id, role, storage_path, sha256, expected_bytes, mime_type")
    .eq("library_item_id", itemId)
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle<CopyAssetRow>();
  if (error || !data) return null;
  const { data: blob, error: downloadError } = await admin.storage.from("mascot-library-copies").download(data.storage_path);
  if (downloadError || !blob) return null;
  return verifyDownloadedAsset(toStoredCopyAsset(data), new Uint8Array(await blob.arrayBuffer()));
}

export async function readCopiedPoseAssets(admin: SupabaseClient, userId: string, itemId: string) {
  const { data, error } = await admin.from("mascot_library_item_assets")
    .select("library_item_id, user_id, role, storage_path, sha256, expected_bytes, mime_type")
    .eq("library_item_id", itemId)
    .eq("user_id", userId)
    .returns<CopyAssetRow[]>();
  if (error || !data?.length) return [];
  const assets = await Promise.all(data.map(async (row) => {
    const { data: blob, error: downloadError } = await admin.storage.from("mascot-library-copies").download(row.storage_path);
    if (downloadError || !blob) return null;
    return verifyDownloadedAsset(toStoredCopyAsset(row), new Uint8Array(await blob.arrayBuffer()));
  }));
  return assets.filter((asset): asset is StoredCopyAsset => asset !== null);
}

function toStoredCopyAsset(row: CopyAssetRow): Omit<StoredCopyAsset, "bytes"> {
  return {
    role: row.role,
    storagePath: row.storage_path,
    sha256: row.sha256,
    expectedBytes: row.expected_bytes,
    mimeType: row.mime_type,
  };
}

function verifyDownloadedAsset(asset: Omit<StoredCopyAsset, "bytes">, bytes: Uint8Array): StoredCopyAsset | null {
  if (bytes.byteLength !== asset.expectedBytes) return null;
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) return null;
  return { ...asset, bytes };
}
