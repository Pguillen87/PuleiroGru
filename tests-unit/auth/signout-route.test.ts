import { describe, expect, it, vi } from "vitest";

const signOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut } })),
}));

describe("POST /auth/signout", () => {
  it("limpa a sessão local mesmo quando a revogação global falha", async () => {
    signOut.mockReset();
    signOut.mockRejectedValueOnce(new Error("indisponível")).mockResolvedValueOnce({ error: null });
    const { POST } = await import("@/app/auth/signout/route");

    await expect(POST()).resolves.toMatchObject({ status: 204 });
    expect(signOut).toHaveBeenNthCalledWith(1, { scope: "global" });
    expect(signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
  });
});
