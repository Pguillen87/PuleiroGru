import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/browser-auth";
import { MutationRequestRejected } from "@/lib/security/mutation-request";
import { PostBirthStoreError } from "./post-birth-store";
import { PostBirthValidationError } from "./post-birth-validation";

export function postBirthErrorResponse(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
) {
  const auth = authErrorResponse(error);
  if (auth) return auth;

  if (error instanceof MutationRequestRejected) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: 403 });
  }

  if (error instanceof PostBirthValidationError || error instanceof PostBirthStoreError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }

  return NextResponse.json({ code: fallbackCode, message: fallbackMessage }, { status: 503 });
}
