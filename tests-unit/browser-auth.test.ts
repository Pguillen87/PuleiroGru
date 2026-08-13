import { describe, expect, it, vi } from "vitest";
import { ensureDevTestIdentityAllowed, RequestAuthError, verifyBrowserTokens } from "@/lib/auth/browser-auth";

const verifier = {
  verifyIdToken: vi.fn(async () => ({ uid: "firebase-owner" })),
  verifyAppCheck: vi.fn(async () => ({ appId: "web-app" })),
};

describe("Firebase ID token e App Check terminam no BFF", () => {
  it("aceita ambos válidos e retorna somente UID", async () => {
    await expect(verifyBrowserTokens("Bearer valid-id", "valid-app-check", verifier)).resolves.toBe("firebase-owner");
    expect(verifier.verifyIdToken).toHaveBeenCalledWith("valid-id");
    expect(verifier.verifyAppCheck).toHaveBeenCalledWith("valid-app-check");
  });

  it("responde 401 sem ID token", async () => {
    await expect(verifyBrowserTokens(null, "app-check", verifier)).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
  });

  it("responde 403 sem App Check", async () => {
    await expect(verifyBrowserTokens("Bearer id-token", null, verifier)).rejects.toMatchObject({ status: 403, code: "APP_CHECK_REQUIRED" });
  });

  it("proíbe identidade local em produção ou com geração habilitada", () => {
    expect(() => ensureDevTestIdentityAllowed("production", false, false)).toThrowError(RequestAuthError);
    expect(() => ensureDevTestIdentityAllowed("development", true, false)).toThrowError(RequestAuthError);
    expect(() => ensureDevTestIdentityAllowed("test", false, false)).not.toThrow();
  });
});
