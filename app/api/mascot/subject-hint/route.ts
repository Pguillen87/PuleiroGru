import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getOrCreateAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { generationConfig } from "@/lib/mascot-generation/config";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import type { SubjectCategory } from "@/lib/mascot-generation/types";
import { ImageValidationError, validateAndSanitizeImage } from "@/lib/mascot-generation/validation";
import { createTraceContext } from "@/lib/observability/mascot-trace";
import { requireTrustedMutationRequest } from "@/lib/security/mutation-request";

export const runtime = "nodejs";

const CATEGORIES = new Set<SubjectCategory>(["human", "animal", "object", "other"]);

export async function POST(request: Request) {
  try {
    requireTrustedMutationRequest(request, { contentTypes: ["multipart/form-data"] });
    const identity = await requireBrowserIdentity(request);
    const attemptId = await getOrCreateAttemptId();
    const trace = createTraceContext(attemptId, false);
    const form = await request.formData();
    const photo = form.get("photo");
    const selectedCategory = String(form.get("selectedCategory") ?? "") as SubjectCategory;
    if (!(photo instanceof File) || !CATEGORIES.has(selectedCategory)) {
      return NextResponse.json({ message: "Foto e tipo são obrigatórios.", code: "INVALID_REQUEST" }, { status: 400 });
    }
    const provider = getMascotGenerationProvider();
    if (!provider.analyzeSubject) {
      return NextResponse.json({
        hint: { version: "subject-hint-v1", suggestedCategory: "uncertain", confidenceBand: "low", requiresConfirmation: false, overrideConfirmed: false },
      });
    }
    const image = await validateAndSanitizeImage(photo, generationConfig.maxUploadBytes, generationConfig.maxImageDimension);
    const hint = await provider.analyzeSubject({ ...image, ...jobIdentity(identity.uid, attemptId, trace), selectedCategory });
    return NextResponse.json({ hint });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 400 });
    }
    return integrationErrorResponse(error, "SUBJECT_HINT_FAILED", "Não foi possível conferir a foto agora.");
  }
}
