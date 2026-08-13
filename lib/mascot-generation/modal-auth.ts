import "server-only";
import { SignJWT } from "jose";
import { generationConfig } from "./config";

const encoder = new TextEncoder();

export async function createModalAccessToken(ownerId: string, attemptId: string) {
  const secret = generationConfig.modalBffJwtSecret;
  if (secret.length < 32) throw new Error("MODAL_BFF_JWT_SECRET deve ter pelo menos 32 caracteres.");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ attempt_id: attemptId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(generationConfig.modalJwtIssuer)
    .setAudience(generationConfig.modalJwtAudience)
    .setSubject(ownerId)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + generationConfig.modalJwtTtlSeconds)
    .sign(encoder.encode(secret));
}
