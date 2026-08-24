import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { jobIdentity } from "@/lib/mascot-generation/attempt";
import { findLibraryItem } from "@/lib/mascot-generation/library-store";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { ACCEPTED_IMAGE_TYPES, type AcceptedImageType, type PoseRole } from "@/lib/mascot-generation/types";
import { createClient } from "@/lib/supabase/server";
import { prepareMascotDisplayAsset } from "@/lib/mascot-generation/display-asset";
import { getCachedMascotAsset } from "@/lib/mascot-generation/asset-cache";
import { readLibraryThumbnail, saveLibraryThumbnail } from "@/lib/mascot-generation/library-thumbnail-store";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const jobIdentityValue = jobIdentity(identity.uid, item.attemptId);
    const variant = new URL(request.url).searchParams.get("variant") === "thumb" ? "thumbnail" : "full";
    const storedThumbnail = variant === "thumbnail"
      ? await readLibraryThumbnail(identity.uid, item.id, role as PoseRole)
      : null;
    if (storedThumbnail) return imageResponse(storedThumbnail.bytes, storedThumbnail.contentType, "storage");
    const packageImage = await readPackagedPose(identity.uid, item.id, role as PoseRole);
    const sourceImage = packageImage ?? await getCachedMascotAsset(
      `pose:${identity.uid}:${item.attemptId}:${item.jobId}:${role}`,
      () => getMascotGenerationProvider().getPoseImage?.(item.jobId, role as PoseRole, jobIdentityValue) ?? Promise.resolve(null),
    );
    const image = sourceImage ? await prepareMascotDisplayAsset(sourceImage, variant) : null;
    if (!image) return new NextResponse(null, { status: 404 });
    if (variant === "thumbnail") await saveLibraryThumbnail(identity.uid, item.id, role as PoseRole, image.bytes);
    return imageResponse(image.bytes, image.contentType, "generated");
  } catch (error) {
    return integrationErrorResponse(error, "LIBRARY_ASSET_READ_FAILED", "Imagem indisponível.");
  }
}

async function readPackagedPose(userId: string, itemId: string, role: PoseRole) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: packageRow } = await admin.from("mascot_packages")
    .select("manifest")
    .eq("user_id", userId)
    .eq("library_item_id", itemId)
    .eq("status", "ready")
    .maybeSingle<{ manifest: unknown }>();
  const asset = findPackageAsset(packageRow?.manifest, role);
  if (!asset) return null;
  const { data, error } = await admin.storage.from("mascot-packages").download(asset.storagePath);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: asset.mimeType };
}

function findPackageAsset(manifest: unknown, role: PoseRole) {
  if (!manifest || typeof manifest !== "object") return null;
  const assets = (manifest as { assets?: unknown }).assets;
  if (!Array.isArray(assets)) return null;
  const asset = assets.find((entry) => entry && typeof entry === "object" && (entry as { role?: unknown }).role === role.toUpperCase()) as { storagePath?: unknown; mimeType?: unknown } | undefined;
  if (typeof asset?.storagePath !== "string" || typeof asset.mimeType !== "string" || !ACCEPTED_IMAGE_TYPES.includes(asset.mimeType as AcceptedImageType)) return null;
  return { storagePath: asset.storagePath, mimeType: asset.mimeType as AcceptedImageType };
}

function imageResponse(bytes: Uint8Array, contentType: string, source: "storage" | "generated") {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "X-Library-Thumbnail-Source": source,
    },
  });
}
