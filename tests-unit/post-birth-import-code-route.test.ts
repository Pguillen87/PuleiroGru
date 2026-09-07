import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTrustedMutationRequest: vi.fn(),
  requireBrowserIdentity: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  createPostBirthImportCode: vi.fn(),
}));

vi.mock("@/lib/security/mutation-request", () => ({ requireTrustedMutationRequest: mocks.requireTrustedMutationRequest, MutationRequestRejected: class MutationRequestRejected extends Error {} }));
vi.mock("@/lib/auth/browser-auth", () => ({ requireBrowserIdentity: mocks.requireBrowserIdentity, authErrorResponse: vi.fn(() => undefined) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/mascot-generation/import-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mascot-generation/import-store")>("@/lib/mascot-generation/import-store");
  return { ...actual, createPostBirthImportCode: mocks.createPostBirthImportCode };
});

describe("POST /api/mascot/incubations/[jobId]/import-code", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireBrowserIdentity.mockResolvedValue({ uid: "owner-import-route", mode: "supabase-session" });
    mocks.createClient.mockResolvedValue({});
    mocks.createAdminClient.mockReturnValue({});
    mocks.createPostBirthImportCode.mockResolvedValue({ code: "GRU-ABCD-1234", packageId: "package-1", expiresAt: "2026-09-07T12:15:00.000Z" });
  });

  it("emite código temporário somente após autenticação e validação da mutação", async () => {
    const { POST } = await import("@/app/api/mascot/incubations/[jobId]/import-code/route");
    const response = await POST(new Request("https://puleiro.test/api/mascot/incubations/job-123/import-code", {
      method: "POST",
      headers: { origin: "https://puleiro.test", "content-type": "application/json" },
      body: "{}",
    }), { params: Promise.resolve({ jobId: "job-123" }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ code: "GRU-ABCD-1234", packageId: "package-1", expiresAt: "2026-09-07T12:15:00.000Z" });
    expect(mocks.requireTrustedMutationRequest).toHaveBeenCalledWith(expect.any(Request), { contentTypes: ["application/json"] });
    expect(mocks.createPostBirthImportCode).toHaveBeenCalledWith({}, {}, "owner-import-route", "job-123");
  });

  it.each([
    ["perfil ainda DRAFT", "IMPORT_PACKAGE_UNAVAILABLE", 409],
    ["mascote não encontrado", "IMPORT_PACKAGE_UNAVAILABLE", 404],
    ["storage indisponível", "IMPORT_CODE_STORAGE_UNAVAILABLE", 503],
  ])("mapeia %s para resposta segura", async (_label, code, status) => {
    const { ImportCodeError } = await import("@/lib/mascot-generation/import-store");
    mocks.createPostBirthImportCode.mockRejectedValueOnce(new ImportCodeError(code as "IMPORT_PACKAGE_UNAVAILABLE" | "IMPORT_CODE_STORAGE_UNAVAILABLE", "detalhe interno", status as 404 | 409 | 503));
    const { POST } = await import("@/app/api/mascot/incubations/[jobId]/import-code/route");
    const response = await POST(new Request("https://puleiro.test/api/pipeline/job-123/import-code", {
      method: "POST",
      headers: { origin: "https://puleiro.test", "content-type": "application/json" },
      body: "{}",
    }), { params: Promise.resolve({ jobId: "job-123" }) });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });
});
