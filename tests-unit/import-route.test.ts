import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveImportCode: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/mascot-generation/import-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mascot-generation/import-store")>("@/lib/mascot-generation/import-store");
  return { ...actual, resolveImportCode: mocks.resolveImportCode };
});

const packageRow = { id: "package-1", user_id: "owner-1", package_version: "1.0.0", manifest: { opaque: true }, status: "ready" };
const manifest = {
  schemaVersion: 1,
  assetPipelineVersion: 3,
  mascotId: "library-item-1",
  packageVersion: "1.0.0",
  displayName: "Mascote GRU",
  visibility: "PRIVATE",
  assets: ["NORMAL", "LISTENING", "TRANSCRIBING"].map((role) => ({
    poseId: `pose-${role}`,
    role,
    storagePath: `v1/owner-1/package-1/${role.toLowerCase()}/a`.padEnd(70, "a"),
    sha256: "a".repeat(64), expectedBytes: 42, mimeType: "image/png", width: 32, height: 48,
  })),
};
const signedUrl = vi.fn(async (path: string): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }> => ({
  data: { signedUrl: `https://private.example/${path}` },
  error: null,
}));

describe("GET /api/mascot/import/[code]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrl: signedUrl })) } });
    mocks.resolveImportCode.mockResolvedValue({ code: "GRU-ABCD-1234", codeRow: {}, package: packageRow, manifest });
  });

  it("devolve o mascotId do manifesto, nunca o identificador interno do pacote", async () => {
    const { GET } = await import("@/app/api/mascot/import/[code]/route");
    const response = await GET(new Request("https://puleiro.test/api/mascot/import/GRU-ABCD-1234"), { params: Promise.resolve({ code: "GRU-ABCD-1234" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ mascotId: "library-item-1", preview: { role: "NORMAL" }, poses: [{ role: "NORMAL" }, { role: "LISTENING" }, { role: "TRANSCRIBING" }] });
  });

  it.each([
    ["expirado", "IMPORT_CODE_EXPIRED", 410],
    ["revogado", "IMPORT_CODE_REVOKED", 410],
    ["desconhecido", "IMPORT_CODE_INVALID", 404],
  ])("mapeia código %s sem assinar URLs", async (_label, code, status) => {
    const { ImportCodeError } = await import("@/lib/mascot-generation/import-store");
    mocks.resolveImportCode.mockRejectedValueOnce(new ImportCodeError(code as "IMPORT_CODE_EXPIRED" | "IMPORT_CODE_REVOKED" | "IMPORT_CODE_INVALID", "detalhe interno", status as 404 | 410));
    const { GET } = await import("@/app/api/mascot/import/[code]/route");
    const response = await GET(new Request("https://puleiro.test/api/mascot/import/GRU-ABCD-1234"), { params: Promise.resolve({ code: "GRU-ABCD-1234" }) });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(signedUrl).not.toHaveBeenCalled();
  });

  it("mapeia falha de assinatura como indisponibilidade temporária", async () => {
    signedUrl.mockResolvedValue({ data: null, error: { message: "storage down" } });
    const { GET } = await import("@/app/api/mascot/import/[code]/route");
    const response = await GET(new Request("https://puleiro.test/api/mascot/import/GRU-ABCD-1234"), { params: Promise.resolve({ code: "GRU-ABCD-1234" }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "IMPORT_CODE_STORAGE_UNAVAILABLE" });
  });
});
