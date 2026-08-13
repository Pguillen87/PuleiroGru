import { NextResponse } from "next/server";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
    return NextResponse.json({ message: "Identificador de nascimento inválido.", code: "INVALID_JOB_ID" }, { status: 400 });
  }
  try {
    const job = await getMascotGenerationProvider().getJob(jobId);
    if (!job) {
      return NextResponse.json({ message: "Nascimento não encontrado.", code: "JOB_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ job }, { status: 200 });
  } catch (error) {
    console.error("mascot_job_read_failed", {
      jobId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { message: "Não foi possível consultar o nascimento agora.", code: "JOB_READ_FAILED" },
      { status: 503 },
    );
  }
}
