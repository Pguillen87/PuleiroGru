import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";

export const runtime = "nodejs";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function GET(request: Request, context: { params: Promise<{ jobId: string; masterId: string }> }) {
  const { jobId, masterId } = await context.params;
  if (!validId(jobId) || !validId(masterId)) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  try {
    const [{ uid }, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) return new NextResponse(null, { status: 404 });
    const provider = getMascotGenerationProvider();
    if (!provider.getMasterImage) return new NextResponse(null, { status: 404 });
    const image = await provider.getMasterImage(jobId, masterId, jobIdentity(uid, attemptId));
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("mascot_master_read_failed", { jobId, masterId, error: error instanceof Error ? error.name : "unknown" });
    return integrationErrorResponse(error, "MASTER_READ_FAILED", "Imagem indisponível.");
  }
}
