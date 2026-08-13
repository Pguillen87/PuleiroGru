import { NextResponse } from "next/server";
import { generationConfig } from "@/lib/mascot-generation/config";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { ImageValidationError, validateImage } from "@/lib/mascot-generation/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > generationConfig.maxUploadBytes + 1024 * 1024) {
      return NextResponse.json(
        { message: `A imagem deve ter até ${Math.floor(generationConfig.maxUploadBytes / 1024 / 1024)} MB.`, code: "FILE_TOO_LARGE" },
        { status: 413 },
      );
    }
    const formData = await request.formData();
    const photo = formData.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json({ message: "Selecione uma foto para continuar.", code: "PHOTO_REQUIRED" }, { status: 400 });
    }
    const image = await validateImage(photo, generationConfig.maxUploadBytes);
    const job = await getMascotGenerationProvider().createMasterJob({
      ...image,
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 400 });
    }
    console.error("mascot_job_create_failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json(
      { message: "Não conseguimos iniciar este nascimento. Tente novamente.", code: "CREATE_JOB_FAILED" },
      { status: 503 },
    );
  }
}
