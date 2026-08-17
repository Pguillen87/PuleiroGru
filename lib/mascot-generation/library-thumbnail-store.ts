import "server-only";
import type { PoseRole } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "mascot-library-assets";
const VERSION = "v4";
let bucketReady: Promise<boolean> | undefined;

export async function readLibraryThumbnail(userId: string, itemId: string, role: PoseRole) {
  const client = createAdminClient();
  if (!client || !await ensureBucket()) return null;
  const { data, error } = await client.storage.from(BUCKET).download(storagePath(userId, itemId, role));
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: "image/webp" as const };
}

export async function saveLibraryThumbnail(userId: string, itemId: string, role: PoseRole, bytes: Uint8Array) {
  const client = createAdminClient();
  if (!client || !await ensureBucket()) return;
  await client.storage.from(BUCKET).upload(storagePath(userId, itemId, role), bytes, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
}

export function storagePath(userId: string, itemId: string, role: PoseRole) {
  return `${VERSION}/${userId}/${itemId}/${role}.webp`;
}

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = createAdminClient()?.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: "524288",
      allowedMimeTypes: ["image/webp"],
    }).then(({ error }) => !error || error.statusCode === "409") ?? Promise.resolve(false);
  }
  return bucketReady;
}
