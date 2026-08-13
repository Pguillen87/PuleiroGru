import "server-only";
import { cookies } from "next/headers";

export const ATTEMPT_COOKIE = "puleiro_attempt";
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export async function getAttemptId() {
  const value = (await cookies()).get(ATTEMPT_COOKIE)?.value;
  return value && ID_PATTERN.test(value) ? value : undefined;
}

export async function getOrCreateAttemptId() {
  return (await getAttemptId()) ?? crypto.randomUUID();
}

export function attemptCookie(attemptId: string) {
  return {
    name: ATTEMPT_COOKIE,
    value: attemptId,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function jobIdentity(ownerId: string, attemptId: string) {
  return { ownerId, attemptId, correlationId: crypto.randomUUID() };
}
