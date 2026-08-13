import { NextResponse } from "next/server";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string; masterId: string }> },
) {
  const { jobId, masterId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || !/^[A-Za-z0-9_-]{1,128}$/.test(masterId)) {
    return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  }
  try {
    const provider = getMascotGenerationProvider();
    if (!provider.getMasterImage) return new NextResponse(null, { status: 404 });
    const image = await provider.getMasterImage(jobId, masterId);
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("mascot_master_read_failed", {
      jobId,
      masterId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ message: "Imagem indisponível." }, { status: 503 });
  }
}
