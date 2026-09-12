import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  findLibraryItem: vi.fn(),
  findLibraryItemByPublicSource: vi.fn(),
  findPublicMascot: vi.fn(),
  getMascotGenerationProvider: vi.fn(),
  normalizePackageAsset: vi.fn(),
  parseReadyManifest: vi.fn(),
}));

vi.mock("@/lib/mascot-generation/library-store", () => ({
  findLibraryItem: mocks.findLibraryItem,
  findLibraryItemByPublicSource: mocks.findLibraryItemByPublicSource,
}));
vi.mock("@/lib/mascot-generation/community-store", () => ({ findPublicMascot: mocks.findPublicMascot }));
vi.mock("@/lib/mascot-generation/provider", () => ({ getMascotGenerationProvider: mocks.getMascotGenerationProvider }));
vi.mock("@/lib/mascot-generation/package-store", () => ({
  normalizePackageAsset: mocks.normalizePackageAsset,
  parseReadyManifest: mocks.parseReadyManifest,
}));

const USER_ID = "00000000-0000-0000-0000-000000000001";
const PUBLIC_ID = "00000000-0000-0000-0000-000000000002";
const RAW = new Uint8Array([1, 2, 3, 4]);
const NORMALIZED = new Uint8Array([9, 8, 7]);
const normalizedHash = createHash("sha256").update(NORMALIZED).digest("hex");

function query() {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  return chain;
}

function adminClient() {
  const storage = {
    upload: vi.fn(async () => ({ error: null })),
    download: vi.fn(async () => ({ data: new Blob([NORMALIZED]), error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  return {
    from: vi.fn(() => query()),
    rpc: vi.fn(async () => ({ data: { idempotent_replay: false }, error: null })),
    storage: { from: vi.fn(() => storage) },
  } as never;
}

function poses() {
  return (["normal", "listening", "transcribing"] as const).map((role) => ({
    id: `pose-${role}`,
    role,
    optionId: `${role}-1`,
    label: role,
    imageUrl: "",
    sha256: createHash("sha256").update(RAW).digest("hex"),
    size: RAW.byteLength,
  }));
}

describe("community copy store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLibraryItemByPublicSource.mockResolvedValueOnce(null).mockResolvedValue({
      id: "copy-1", displayName: "Pipoca", mascotCode: "GRU-AAAA-BBBB", jobId: null, attemptId: null, masterId: null,
      origin: "public_copy", sourcePublicMascotId: PUBLIC_ID, poses: poses(), createdAt: "2026-09-11T12:00:00.000Z", isFavorite: false,
    });
    mocks.findPublicMascot.mockResolvedValue({
      id: PUBLIC_ID, source_item_id: "source-1", published_by: "source-owner", mascot_code: "GRU-SOURCE-CODE", pose_snapshot: poses(), published_at: "2026-09-11T11:00:00.000Z", favorite_count: 0, save_count: 0,
    });
    mocks.findLibraryItem.mockResolvedValue({
      id: "source-1", displayName: "Origem", mascotCode: "GRU-SOURCE-CODE", jobId: "job-1", attemptId: "attempt-1", masterId: "master-1", origin: "generated", poses: poses(), createdAt: "2026-09-11T10:00:00.000Z", isFavorite: false,
    });
    mocks.parseReadyManifest.mockReturnValue(null);
    mocks.normalizePackageAsset.mockResolvedValue({ bytes: NORMALIZED, sha256: normalizedHash, mimeType: "image/png", width: 256, height: 256 });
    mocks.getMascotGenerationProvider.mockReturnValue({
      getJob: vi.fn().mockResolvedValue({ approvedMasterId: "master-1" }),
      getPoseImage: vi.fn().mockResolvedValue({ bytes: RAW, contentType: "image/png" }),
    });
  });

  it("verifica as três poses, publica assets privados e confirma uma cópia atômica", async () => {
    const { createPublicMascotCopy } = await import("@/lib/mascot-generation/community-copy-store");
    const admin = adminClient();

    const result = await createPublicMascotCopy(admin, USER_ID, PUBLIC_ID, "Pipoca");

    expect(result).toMatchObject({ sourcePublicMascotId: PUBLIC_ID, item: { origin: "public_copy" }, idempotentReplay: false });
    expect((admin as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("create_public_mascot_copy", expect.objectContaining({
      p_user_id: USER_ID,
      p_source_public_mascot_id: PUBLIC_ID,
      p_pose_snapshot: expect.arrayContaining([expect.objectContaining({ role: "normal", imageUrl: "" })]),
      p_assets: expect.arrayContaining([expect.objectContaining({ role: "listening", mimeType: "image/png" })]),
    }));
    expect((admin as { storage: { from: ReturnType<typeof vi.fn> } }).storage.from).toHaveBeenCalled();
  });

  it("reutiliza a cópia pronta sem buscar novamente os assets", async () => {
    const existing = { id: "copy-1", origin: "public_copy" };
    mocks.findLibraryItemByPublicSource.mockReset();
    mocks.findLibraryItemByPublicSource.mockResolvedValue(existing);
    const { createPublicMascotCopy } = await import("@/lib/mascot-generation/community-copy-store");

    const result = await createPublicMascotCopy(adminClient(), USER_ID, PUBLIC_ID);

    expect(result).toMatchObject({ item: existing, idempotentReplay: true });
    expect(mocks.findPublicMascot).not.toHaveBeenCalled();
    expect(mocks.getMascotGenerationProvider).not.toHaveBeenCalled();
  });

  it("converte disputa concorrente do índice único em replay e limpa os uploads temporários", async () => {
    mocks.findLibraryItemByPublicSource.mockReset();
    mocks.findLibraryItemByPublicSource
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "copy-race", origin: "public_copy" });
    const admin = adminClient();
    (admin as { rpc: ReturnType<typeof vi.fn> }).rpc.mockResolvedValueOnce({ data: null, error: { code: "23505" } });

    const { createPublicMascotCopy } = await import("@/lib/mascot-generation/community-copy-store");
    const result = await createPublicMascotCopy(admin, USER_ID, PUBLIC_ID, "Pipoca");

    expect(result).toMatchObject({ item: { id: "copy-race" }, idempotentReplay: true });
    expect((admin as { storage: { from: ReturnType<typeof vi.fn> } }).storage.from).toHaveBeenCalled();
  });
});
