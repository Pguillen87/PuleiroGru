import { afterEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

describe("JWT curto BFF → Modal", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("assina identidade, attemptId, audience e expiração curta", async () => {
    const secret = "s".repeat(48);
    vi.stubEnv("MODAL_BFF_JWT_SECRET", secret);
    vi.stubEnv("MODAL_BFF_JWT_TTL_SECONDS", "90");
    const { createModalAccessToken } = await import("@/lib/mascot-generation/modal-auth");
    const token = await createModalAccessToken("owner-123", "attempt-1234567890");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "puleiro-bff", audience: "gru-modal" });
    expect(payload.sub).toBe("owner-123");
    expect(payload.attempt_id).toBe("attempt-1234567890");
    expect(payload.jti).toBeTruthy();
    expect(Number(payload.exp) - Number(payload.iat)).toBe(90);
  });

  it("não aceita secret fraco", async () => {
    vi.stubEnv("MODAL_BFF_JWT_SECRET", "fraco");
    const { createModalAccessToken } = await import("@/lib/mascot-generation/modal-auth");
    await expect(createModalAccessToken("owner-123", "attempt-1234567890")).rejects.toThrow("32 caracteres");
  });
});
