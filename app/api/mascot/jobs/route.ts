import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { attemptCookie, getOrCreateAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { ImageValidationError, validateAndSanitizeImage } from "@/lib/mascot-generation/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    if (!generationConfig.registrationEnabled) {
      return NextResponse.json({ message: "Novos registros estão temporariamente pausados.", code: "REGISTRATION_DISABLED" }, { status: 409 });
    }
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > generationConfig.maxUploadBytes + 1024 * 1024) {
      return NextResponse.json({ message: "A imagem excede o limite permitido.", code: "FILE_TOO_LARGE" }, { status: 413 });
    }
    const formData = await request.formData();
    const photo = formData.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json({ message: "Selecione uma foto para continuar.", code: "PHOTO_REQUIRED" }, { status: 400 });
    }
    const image = await validateAndSanitizeImage(photo, generationConfig.maxUploadBytes, generationConfig.maxImageDimension);
    const attemptId = await getOrCreateAttemptId();
    const context = jobIdentity(identity.uid, attemptId);
    const job = await getMascotGenerationProvider().createMasterJob({
      ...image,
      ...context,
      idempotencyKey: `register:${identity.uid}:${attemptId}`,
    });
    const response = NextResponse.json({ job }, { status: job.status === "registered" ? 201 : 202 });
    response.cookies.set(attemptCookie(attemptId));
    response.headers.set("X-Correlation-Id", context.correlationId);
    return response;
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 400 });
    }
    console.error("mascot_job_create_failed", { error: error instanceof Error ? error.name : "unknown" });
    return integrationErrorResponse(error, "CREATE_JOB_FAILED", "Não conseguimos registrar este nascimento.");
  }
}
