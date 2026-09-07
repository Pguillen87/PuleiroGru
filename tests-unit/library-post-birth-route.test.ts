import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostBirthStoreError } from "@/lib/mascot-generation/post-birth-store";

const mocks = vi.hoisted(() => ({
  requireBrowserIdentity: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  listLibraryItems: vi.fn(),
  listActivePostBirthProfiles: vi.fn(),
}));
const { requireBrowserIdentity, createClient, createAdminClient, listLibraryItems, listActivePostBirthProfiles } = mocks;

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
vi.mock("@/lib/mascot-generation/library-store", () => ({ listLibraryItems: mocks.listLibraryItems }));
vi.mock("@/lib/mascot-generation/post-birth-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mascot-generation/post-birth-store")>("@/lib/mascot-generation/post-birth-store");
  return { ...actual, listActivePostBirthProfiles: mocks.listActivePostBirthProfiles };
});

const OWNER_ID = "owner-123";
const client = {};

function activeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    userId: OWNER_ID,
    attemptId: "attempt-post-birth-0001",
    modalJobId: "job-post-birth-0001",
    state: "ACTIVE",
    displayName: "Pipoca",
    journalConfig: { version: 1 },
    configurationRevision: 5,
    createdAt: "2026-09-07T12:00:00.000Z",
    updatedAt: "2026-09-07T12:05:00.000Z",
    activatedAt: "2026-09-07T12:05:00.000Z",
    ...overrides,
  };
}

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
    listActivePostBirthProfiles.mockResolvedValue([activeProfile()]);
  });

  it("returns active post-birth profiles with owner-scoped data", async () => {
    const response = await getLibrary();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [],
      postBirthProfiles: [{ id: "profile-1", displayName: "Pipoca", state: "ACTIVE", modalJobId: "job-post-birth-0001" }],
    });
    expect(listActivePostBirthProfiles).toHaveBeenCalledWith(client, OWNER_ID);
  });

  it("fails closed when the post-birth projection cannot be read", async () => {
    listActivePostBirthProfiles.mockRejectedValueOnce(new PostBirthStoreError("POST_BIRTH_PROFILE_READ_FAILED"));

    const response = await getLibrary();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "LIBRARY_READ_FAILED" });
  });
});
