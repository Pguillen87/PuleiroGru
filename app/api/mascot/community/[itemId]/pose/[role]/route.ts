import { NextResponse } from "next/server";
import { findPublicMascot, validPoseRole } from "@/lib/mascot-generation/community-store";
import { getCachedMascotAsset } from "@/lib/mascot-generation/asset-cache";
import { prepareMascotDisplayAsset } from "@/lib/mascot-generation/display-asset";
import { readLibraryThumbnail, saveLibraryThumbnail } from "@/lib/mascot-generation/library-thumbnail-store";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { jobIdentity } from "@/lib/mascot-generation/attempt";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ itemId: string; role: string }> }) {
  try {
    const { itemId, role } = await context.params;
    if (!validPoseRole(role)) return new NextResponse(null, { status: 404 });
    const admin = createAdminClient();
    if (!admin) return new NextResponse(null, { status: 503 });
    const publicItem = await findPublicMascot(admin, itemId);
    if (!publicItem) return new NextResponse(null, { status: 404 });
    const { data: source } = await admin.from("mascot_library_items").select("id,user_id,attempt_id,modal_job_id").eq("id", publicItem.source_item_id).maybeSingle<{ id: string; user_id: string; attempt_id: string; modal_job_id: string }>();
    if (!source) return new NextResponse(null, { status: 404 });
    const stored = await readLibraryThumbnail(source.user_id, source.id, role);
    if (stored) return imageResponse(stored.bytes, stored.contentType);
    const raw = await getCachedMascotAsset(`community:${source.id}:${role}`, () => getMascotGenerationProvider().getPoseImage?.(source.modal_job_id, role, jobIdentity(source.user_id, source.attempt_id)) ?? Promise.resolve(null));
    const image = raw ? await prepareMascotDisplayAsset(raw, "thumbnail") : null;
    if (!image) return new NextResponse(null, { status: 404 });
    await saveLibraryThumbnail(source.user_id, source.id, role, image.bytes);
    return imageResponse(image.bytes, image.contentType);
  } catch { return new NextResponse(null, { status: 404 }); }
}

function imageResponse(bytes: Uint8Array, contentType: string) {
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
