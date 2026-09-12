import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTrustedMutationRequest = vi.fn();
const requireBrowserIdentity = vi.fn();
const createAdminClient = vi.fn();
const copyStoreMocks = vi.hoisted(() => ({ createPublicMascotCopy: vi.fn() }));

vi.mock("@/lib/security/mutation-request", () => ({ requireTrustedMutationRequest }));
vi.mock("@/lib/auth/browser-auth", () => ({
  authErrorResponse: (error: unknown) => {
    if (!error || typeof error !== "object" || !("status" in error)) return undefined;
    const typed = error as { status?: number; code?: string; message?: string };
    return typeof typed.status === "number" ? Response.json({ code: typed.code, message: typed.message }, { status: typed.status }) : undefined;
  },
  requireBrowserIdentity,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/mascot-generation/community-copy-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mascot-generation/community-copy-store")>("@/lib/mascot-generation/community-copy-store");
  return { ...actual, createPublicMascotCopy: copyStoreMocks.createPublicMascotCopy };
});

const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const PUBLIC_ID = "00000000-0000-0000-0000-000000000002";
const admin = {};

function request(body: unknown = {}) {
  return new Request(`https://puleiro.test/api/mascot/community/${PUBLIC_ID}/copy`, {
    method: "POST",
    headers: { origin: "https://puleiro.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown = {}) {
  const { POST } = await import("@/app/api/mascot/community/[itemId]/copy/route");
  return POST(request(body), { params: Promise.resolve({ itemId: PUBLIC_ID }) });
}

describe("POST /api/mascot/community/[itemId]/copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: OWNER_ID, mode: "supabase-session" });
    createAdminClient.mockReturnValue(admin);
    copyStoreMocks.createPublicMascotCopy.mockResolvedValue({
      item: { id: "copy-1", displayName: "Pipoca", origin: "public_copy" },
      sourcePublicMascotId: PUBLIC_ID,
      idempotentReplay: false,
    });
  });

  it("cria uma cópia independente e retorna 201", async () => {
    const response = await post({ displayName: "Pipoca" });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ item: { origin: "public_copy" }, idempotentReplay: false });
    expect(copyStoreMocks.createPublicMascotCopy).toHaveBeenCalledWith(admin, OWNER_ID, PUBLIC_ID, "Pipoca");
  });

  it("retorna replay 200 para uma cópia já existente", async () => {
    copyStoreMocks.createPublicMascotCopy.mockResolvedValueOnce({
      item: { id: "copy-1", origin: "public_copy" }, sourcePublicMascotId: PUBLIC_ID, idempotentReplay: true,
    });

    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ idempotentReplay: true });
  });

  it("exige sessão real e trata payload inválido", async () => {
    requireBrowserIdentity.mockResolvedValueOnce({ uid: OWNER_ID, mode: "development" });
    expect((await post()).status).toBe(401);
    expect(copyStoreMocks.createPublicMascotCopy).not.toHaveBeenCalled();

    requireBrowserIdentity.mockResolvedValueOnce({ uid: OWNER_ID, mode: "supabase-session" });
    expect((await post({ displayName: 42 })).status).toBe(400);
  });

  it("preserva códigos seguros de domínio", async () => {
    const { MascotCopyError } = await import("@/lib/mascot-generation/community-copy-store");
    copyStoreMocks.createPublicMascotCopy.mockRejectedValueOnce(new MascotCopyError("PUBLIC_MASCOT_COPY_CONFLICT", "detalhe interno"));

    const response = await post({ displayName: "Pipoca" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "PUBLIC_MASCOT_COPY_CONFLICT", message: "detalhe interno" });
  });
});
