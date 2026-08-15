import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

import { ensureDevTestIdentityAllowed, RequestAuthError, requireBrowserIdentity } from "@/lib/auth/browser-auth";

describe("Supabase Auth termina no BFF", () => {
  beforeEach(() => getUser.mockReset());

  it("usa somente o user.id validado pelo Supabase", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "a9155fc2-e907-4e41-9cd6-a1762be3581c" } }, error: null });
    await expect(requireBrowserIdentity(new Request("https://puleiro.test"))).resolves.toEqual({
      uid: "a9155fc2-e907-4e41-9cd6-a1762be3581c",
      mode: "supabase-session",
    });
  });

  it("responde sessão expirada sem usuário validado", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    await expect(requireBrowserIdentity(new Request("https://puleiro.test"))).rejects.toMatchObject({
      status: 401,
      code: "SESSION_EXPIRED",
    });
  });

  it("proíbe identidade local em produção ou com geração habilitada", () => {
    expect(() => ensureDevTestIdentityAllowed("production", false, false)).toThrowError(RequestAuthError);
    expect(() => ensureDevTestIdentityAllowed("development", true, false)).toThrowError(RequestAuthError);
    expect(() => ensureDevTestIdentityAllowed("test", false, false)).not.toThrow();
  });
});
