import { NextResponse } from "next/server";
import { ImportCodeError, isValidImportCode, resolveImportCode } from "@/lib/mascot-generation/import-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientAddress, consumeRequestBudget } from "@/lib/security/request-rate-limit";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const budget = consumeRequestBudget(`mascot-import:${clientAddress(_request)}`, 30, 60_000);
  if (!budget.allowed) {
    return NextResponse.json({ code: "IMPORT_RATE_LIMITED" }, {
      status: 429,
      headers: { "Retry-After": String(budget.retryAfterSeconds), "Cache-Control": "no-store" },
    });
  }
  const admin = createAdminClient();
  if (!admin) return response("IMPORT_CODE_STORAGE_UNAVAILABLE", 503);
  const { code } = await context.params;
  if (!isValidImportCode(code.trim().toUpperCase())) return response("IMPORT_CODE_INVALID", 400);
  let resolved;
  try {
    resolved = await resolveImportCode(admin, code);
  } catch (error) {
    if (error instanceof ImportCodeError) return response(error.code, error.status);
    return response("IMPORT_CODE_STORAGE_UNAVAILABLE", 503);
  }
  const { package: packageRow, manifest } = resolved;
  if (!packageRow.user_id || manifest.assets.some((asset) => !asset.storagePath.startsWith(`v1/${packageRow.user_id}/${packageRow.id}/`))) {
    return response("IMPORT_PACKAGE_UNAVAILABLE", 409);
  }
  const normalAsset = manifest.assets.find((asset) => asset.role === "NORMAL");
  if (!normalAsset || manifest.assets.length !== 3) return response("IMPORT_PACKAGE_UNAVAILABLE", 409);
  let assets;
  try {
    assets = await Promise.all(manifest.assets.map(async (asset) => {
      const signed = await admin.storage.from("mascot-packages").createSignedUrl(asset.storagePath, 300);
      if (signed.error || !signed.data?.signedUrl) throw new Error("SIGNED_URL_FAILED");
      return { ...asset, assetUrl: signed.data.signedUrl };
    }));
  } catch {
    return response("IMPORT_CODE_STORAGE_UNAVAILABLE", 503);
  }
  const normal = assets.find((asset) => asset.role === "NORMAL");
  if (!normal || assets.length !== 3) return response("IMPORT_PACKAGE_UNAVAILABLE", 409);
  return NextResponse.json({
    schemaVersion: 1,
    packageId: manifest.packageId,
    mascotId: manifest.mascotId,
    packageVersion: packageRow.package_version,
    createdAt: manifest.createdAt,
    publishedAt: manifest.publishedAt,
    displayName: manifest.displayName,
    visibility: manifest.visibility,
    preview: normal,
    poses: assets,
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function response(code: string, status: number) {
  return NextResponse.json({ code }, { status });
}
