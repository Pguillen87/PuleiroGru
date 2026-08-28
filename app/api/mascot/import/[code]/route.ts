import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseReadyManifest, resolveMascotImportCode } from "@/lib/mascot-generation/package-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ code: "IMPORT_UNAVAILABLE" }, { status: 503 });
  const { code } = await context.params;
  if (!/^GRU-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.toUpperCase())) return NextResponse.json({ code: "INVALID_IMPORT_CODE" }, { status: 400 });
  const packageRow = await resolveMascotImportCode(admin, code);
  if (!packageRow) return NextResponse.json({ code: "IMPORT_NOT_FOUND" }, { status: 404 });
  const manifest = parseReadyManifest(packageRow.manifest);
  if (!manifest) return NextResponse.json({ code: "INVALID_PACKAGE" }, { status: 409 });
  if (!packageRow.user_id || manifest.assets.some((asset) => !asset.storagePath.startsWith(`v1/${packageRow.user_id}/${packageRow.id}/`))) {
    return NextResponse.json({ code: "INVALID_PACKAGE" }, { status: 409 });
  }
  const normalAsset = manifest.assets.find((asset) => asset.role === "NORMAL");
  if (!normalAsset || manifest.assets.length !== 3) return NextResponse.json({ code: "INVALID_PACKAGE" }, { status: 409 });
  const assets = await Promise.all(manifest.assets.map(async (asset) => {
    const signed = await admin.storage.from("mascot-packages").createSignedUrl(asset.storagePath, 300);
    if (signed.error || !signed.data?.signedUrl) throw new Error("SIGNED_URL_FAILED");
    return { ...asset, assetUrl: signed.data.signedUrl };
  }));
  const normal = assets.find((asset) => asset.role === "NORMAL");
  if (!normal || assets.length !== 3) return NextResponse.json({ code: "INVALID_PACKAGE" }, { status: 409 });
  return NextResponse.json({
    schemaVersion: 1,
    mascotId: manifest.mascotId,
    packageVersion: packageRow.package_version,
    displayName: manifest.displayName,
    visibility: manifest.visibility,
    preview: normal,
    poses: assets,
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
