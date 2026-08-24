import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTrustedMutationRequest = vi.fn();
const requireBrowserIdentity = vi.fn();
const findLibraryItem = vi.fn();
const createAdminClient = vi.fn();
const createClient = vi.fn();
const publishMascotPackage = vi.fn();
const publishMascot = vi.fn();
const unpublishMascot = vi.fn();

vi.mock("@/lib/security/mutation-request", () => ({ requireTrustedMutationRequest }));
vi.mock("@/lib/auth/browser-auth", () => ({
  authErrorResponse: vi.fn(() => null),
  requireBrowserIdentity,
}));
vi.mock("@/lib/mascot-generation/library-store", () => ({ findLibraryItem }));
vi.mock("@/lib/mascot-generation/package-store", () => ({ publishMascotPackage }));
vi.mock("@/lib/mascot-generation/community-store", () => ({ publishMascot, unpublishMascot }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const ownerId = "8e558341-61cf-4a4a-9773-35f20f4c194e";
const item = { id: "f1c91e0b-d83c-4cec-aac1-983992c8db40", mascotCode: "GRU-ABCD-2345" };
const client = {};
const admin = {};

describe("POST /api/mascot/library/[itemId]/publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: ownerId, mode: "supabase-session" });
    createClient.mockResolvedValue(client);
    createAdminClient.mockReturnValue(admin);
    findLibraryItem.mockResolvedValue(item);
    publishMascotPackage.mockResolvedValue({ item, package: { id: "package-id" } });
    publishMascot.mockResolvedValue({ id: "public-id", mascotCode: item.mascotCode });
  });

  it("prepara o pacote antes de tornar o mascote público", async () => {
    const { POST } = await import("@/app/api/mascot/library/[itemId]/publication/route");
    const response = await POST(new Request("https://puleiro.test/api/mascot/library/item/publication", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }), { params: Promise.resolve({ itemId: item.id }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ published: true, item: { mascotCode: item.mascotCode } });
    expect(publishMascotPackage).toHaveBeenCalledWith(client, ownerId, item.id);
    expect(publishMascot).toHaveBeenCalledWith(admin, ownerId, item);
    expect(publishMascotPackage.mock.invocationCallOrder[0]).toBeLessThan(publishMascot.mock.invocationCallOrder[0]);
  });

  it("não publica quando o empacotamento falha", async () => {
    publishMascotPackage.mockRejectedValueOnce(new Error("assets indisponíveis"));
    const { POST } = await import("@/app/api/mascot/library/[itemId]/publication/route");
    const response = await POST(new Request("https://puleiro.test/api/mascot/library/item/publication", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }), { params: Promise.resolve({ itemId: item.id }) });

    expect(response.status).toBe(500);
    expect(publishMascot).not.toHaveBeenCalled();
  });
});
