import { NextResponse } from "next/server";
import { authErrorResponse, requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { requirePreviewFixtureOwner } from "@/lib/auth/preview-fixture-owner";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { finalizeMascotPackage } from "@/lib/mascot-generation/package-finalization";
import {
  isPreviewApprovedJobEnvironment,
  PREVIEW_APPROVED_DISPLAY_NAME,
  PREVIEW_APPROVED_JOB_ID,
  resolvePreviewApprovedJobBinding,
} from "@/lib/mascot-generation/preview-approved-job";
import { createClient } from "@/lib/supabase/server";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPreviewApprovedJobEnvironment()) return new NextResponse(null, { status: 404 });
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["application/json"] });
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ code: "SESSION_REQUIRED" }, { status: 401 });
    await requirePreviewFixtureOwner(identity.uid);
    const client = await createClient();
    const binding = await resolvePreviewApprovedJobBinding(client, identity.uid);
    const finalized = await finalizeMascotPackage({
      client,
      userId: identity.uid,
      attemptId: binding.attemptId,
      jobId: PREVIEW_APPROVED_JOB_ID,
      displayName: PREVIEW_APPROVED_DISPLAY_NAME,
    });
    return safeFinalizationResponse(finalized);
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return noStore(auth);
    return noStore(integrationErrorResponse(error, "PREVIEW_FINALIZATION_FAILED", "Não foi possível finalizar o mascote aprovado."));
  }
}

function safeFinalizationResponse(finalized: Awaited<ReturnType<typeof finalizeMascotPackage>>) {
  const manifest = finalized.package.manifest as { schemaVersion?: unknown; assets?: Array<{ role?: unknown; sha256?: unknown }> };
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  return noStore(NextResponse.json({
    itemId: shortId(finalized.item.id),
    packageId: shortId(finalized.package.id),
    status: finalized.package.status,
    poseCount: assets.length,
    roles: assets.map((asset) => asset.role).filter((role): role is string => typeof role === "string"),
    manifest: {
      schemaVersion: manifest.schemaVersion === 1 ? 1 : null,
      assetHashes: assets.map((asset) => typeof asset.sha256 === "string" ? `${asset.sha256.slice(0, 12)}…` : null),
    },
    importAvailable: finalized.package.status === "ready",
    idempotency: "package finalization reuses the same library item and package for this job",
  }));
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function noStore<T extends Response>(response: T) {
  response.headers.set("cache-control", "no-store");
  return response;
}
