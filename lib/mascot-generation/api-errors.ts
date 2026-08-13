import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/browser-auth";
import { ModalProviderError } from "./modal-provider";

export function integrationErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  const auth = authErrorResponse(error);
  if (auth) return auth;
  if (error instanceof ModalProviderError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 503;
    const safeMessages: Record<string, string> = {
      GENERATION_DISABLED: "A geração real ainda não foi autorizada.",
      POSE_GENERATION_DISABLED: "A criação de poses ainda não está disponível.",
      JOB_NOT_FOUND: "Nascimento não encontrado.",
      ATTEMPT_MISMATCH: "Esta tentativa não pertence à sessão atual.",
    };
    return NextResponse.json({ message: safeMessages[error.code] ?? fallbackMessage, code: error.code }, { status });
  }
  return NextResponse.json({ message: fallbackMessage, code: fallbackCode }, { status: 503 });
}
