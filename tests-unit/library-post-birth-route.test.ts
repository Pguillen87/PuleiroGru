import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireBrowserIdentity: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  listLibraryItems: vi.fn(),
  normalizeLibraryQuery: vi.fn((value: string) => value),
}));
const { requireBrowserIdentity, createClient, createAdminClient, listLibraryItems } = mocks;

vi.mock("@/lib/auth/browser-auth", () => ({
  requireBrowserIdentity: mocks.requireBrowserIdentity,
  authErrorResponse: (error: unknown) => {
    if (!error || typeof error !== "object" || !("status" in error)) return undefined;
    const typed = error as { status?: number; code?: string; message?: string };
    return typeof typed.status === "number"
      ? Response.json({ code: typed.code ?? "SESSION_EXPIRED", message: typed.message ?? "Não autenticado." }, { status: typed.status })
      : undefined;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/mascot-generation/library-store", () => ({
  listLibraryItems: mocks.listLibraryItems,
  normalizeLibraryQuery: mocks.normalizeLibraryQuery,
}));

const OWNER_ID = "owner-123";
const client = {};

async function getLibrary() {
  const route = await import("@/app/api/mascot/library/route");
  return route.GET(new Request("https://puleiro.test/api/mascot/library?offset=0&limit=24"));
}

describe("GET /api/mascot/library post-birth projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: OWNER_ID, mode: "supabase-session" });
    createClient.mockResolvedValue(client);
    createAdminClient.mockReturnValue(null);
    listLibraryItems.mockResolvedValue({ items: [], total: 0 });
  });

  it("keeps the personal library focused on completed mascots", async () => {
    const response = await getLibrary();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [],
      total: 0,
      nextOffset: null,
    });
  });

  it("fails closed when the library projection cannot be read", async () => {
    listLibraryItems.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await getLibrary();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "LIBRARY_READ_FAILED" });
  });
});
