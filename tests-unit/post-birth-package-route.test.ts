import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTrustedMutationRequest: vi.fn(),
  requireBrowserIdentity: vi.fn(),
  createClient: vi.fn(),
  publishPostBirthMascotPackage: vi.fn(),
}));

vi.mock("@/lib/security/mutation-request", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/mutation-request")>("@/lib/security/mutation-request");
  return { ...actual, requireTrustedMutationRequest: mocks.requireTrustedMutationRequest };
});
vi.mock("@/lib/auth/browser-auth", () => ({
  requireBrowserIdentity: mocks.requireBrowserIdentity,
  authErrorResponse: vi.fn(() => undefined),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/mascot-generation/package-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mascot-generation/package-store")>("@/lib/mascot-generation/package-store");
  return { ...actual, publishPostBirthMascotPackage: mocks.publishPostBirthMascotPackage };
});

const ownerId = "owner-package";
const client = {};
const packageResult = {
  package: { id: "package-1", status: "ready", package_version: "1.0.0", manifest: { schemaVersion: 1 } },
  manifestUrl: "https://storage.example/signed-manifest",
  manifestExpiresIn: 300,
  idempotentReplay: false,
};

describe("POST /api/mascot/incubations/[jobId]/package", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireBrowserIdentity.mockResolvedValue({ uid: ownerId, mode: "supabase-session" });
    mocks.createClient.mockResolvedValue(client);
    mocks.publishPostBirthMascotPackage.mockResolvedValue(packageResult);
  });

  it("publica o pacote V1 e devolve a URL assinada do manifesto", async () => {
    const { POST } = await import("@/app/api/mascot/incubations/[jobId]/package/route");
    const response = await POST(new Request("https://puleiro.test/api/mascot/incubations/job-123/package", {
      method: "POST",
      headers: { origin: "https://puleiro.test", "content-type": "application/json" },
      body: "{}",
    }), { params: Promise.resolve({ jobId: "job-123" }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      manifestUrl: packageResult.manifestUrl,
      manifestExpiresIn: 300,
      idempotentReplay: false,
      package: { id: "package-1", status: "ready" },
    });
    expect(mocks.publishPostBirthMascotPackage).toHaveBeenCalledWith(client, ownerId, "job-123");
  });

  it.each([
    ["perfil não ativo", "POST_BIRTH_PROFILE_NOT_ACTIVE", 409],
    ["checksum inválido", "INVALID_CHECKSUM", 409],
    ["asset ausente", "ASSET_MISSING", 409],
    ["manifesto inválido", "MANIFEST_INVALID", 409],
    ["storage indisponível", "PACKAGE_STORAGE_UNAVAILABLE", 503],
  ])("mapeia %s para resposta segura", async (_label, code, status) => {
    const { MascotPackageError } = await import("@/lib/mascot-generation/package-store");
    mocks.publishPostBirthMascotPackage.mockRejectedValueOnce(new MascotPackageError(code, "detalhe interno"));
    const { POST } = await import("@/app/api/mascot/incubations/[jobId]/package/route");

    const response = await POST(new Request("https://puleiro.test/api/mascot/incubations/job-123/package", {
      method: "POST",
      headers: { origin: "https://puleiro.test", "content-type": "application/json" },
      body: "{}",
    }), { params: Promise.resolve({ jobId: "job-123" }) });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });
});
