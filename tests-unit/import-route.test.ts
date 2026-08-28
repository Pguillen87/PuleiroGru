import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClient = vi.fn();
const resolveMascotImportCode = vi.fn();
const parseReadyManifest = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/mascot-generation/package-store", () => ({ resolveMascotImportCode, parseReadyManifest }));

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

describe("GET /api/mascot/import/[code]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createAdminClient.mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://private.example/${path}` }, error: null })) })) } });
    resolveMascotImportCode.mockResolvedValue(packageRow);
    parseReadyManifest.mockReturnValue(manifest);
  });

  it("devolve o mascotId do manifesto, nunca o identificador interno do pacote", async () => {
    const { GET } = await import("@/app/api/mascot/import/[code]/route");
    const response = await GET(new Request("https://puleiro.test/api/mascot/import/GRU-ABCD-1234"), { params: Promise.resolve({ code: "GRU-ABCD-1234" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ mascotId: "library-item-1", preview: { role: "NORMAL" }, poses: [{ role: "NORMAL" }, { role: "LISTENING" }, { role: "TRANSCRIBING" }] });
  });

  it("recusa manifesto que não passou na validação antes de assinar URLs", async () => {
    parseReadyManifest.mockReturnValue(null);
    const { GET } = await import("@/app/api/mascot/import/[code]/route");
    const response = await GET(new Request("https://puleiro.test/api/mascot/import/GRU-ABCD-1234"), { params: Promise.resolve({ code: "GRU-ABCD-1234" }) });

    expect(response.status).toBe(409);
    expect(createAdminClient().storage.from).not.toHaveBeenCalled();
  });
});
