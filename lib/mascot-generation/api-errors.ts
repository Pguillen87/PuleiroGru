import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/browser-auth";
import { ModalProviderError } from "./modal-provider";

export function integrationErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  const auth = authErrorResponse(error);
  if (auth) return auth;
  if (error instanceof ModalProviderError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 503;
    return NextResponse.json({ message: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ message: fallbackMessage, code: fallbackCode }, { status: 503 });
}
