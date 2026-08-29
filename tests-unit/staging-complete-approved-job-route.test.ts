import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireTrustedMutationRequest = vi.fn();
const requireBrowserIdentity = vi.fn();
const requirePreviewFixtureOwner = vi.fn();
const createClient = vi.fn();
const resolvePreviewApprovedJobBinding = vi.fn();
const finalizeMascotPackage = vi.fn();

vi.mock("@/lib/security/mutation-request", () => ({ requireTrustedMutationRequest }));
vi.mock("@/lib/auth/browser-auth", () => ({
  authErrorResponse: vi.fn(() => null),
  requireBrowserIdentity,
}));
vi.mock("@/lib/auth/preview-fixture-owner", () => ({ requirePreviewFixtureOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/mascot-generation/preview-approved-job", () => ({
  isPreviewApprovedJobEnvironment: () => process.env.VERCEL_ENV === "preview",
  PREVIEW_APPROVED_DISPLAY_NAME: "Mascote GRU",
  PREVIEW_APPROVED_JOB_ID: "job_43136e0b5283358281bc1d4c6efa8c01",
  resolvePreviewApprovedJobBinding,
}));
vi.mock("@/lib/mascot-generation/package-finalization", () => ({ finalizeMascotPackage }));
vi.mock("@/lib/mascot-generation/api-errors", () => ({
  integrationErrorResponse: () => Response.json({ code: "PREVIEW_FINALIZATION_FAILED" }, { status: 503 }),
}));

const ownerId = "8e558341-61cf-4a4a-9773-35f20f4c194e";
const client = {};
const finalized = {
  item: { id: "87654321-1111-2222-3333-123456789abc" },
  package: {
    id: "12345678-1111-2222-3333-abcdefabcdef",
    status: "ready",
    manifest: {
      schemaVersion: 1,
      assets: [
        { role: "NORMAL", sha256: "a".repeat(64) },
        { role: "LISTENING", sha256: "b".repeat(64) },
        { role: "TRANSCRIBING", sha256: "c".repeat(64) },
      ],
    },
  },
};

describe("POST /api/internal/staging-complete-approved-job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "preview");
    requireBrowserIdentity.mockResolvedValue({ uid: ownerId, mode: "supabase-session" });
    createClient.mockResolvedValue(client);
    resolvePreviewApprovedJobBinding.mockResolvedValue({ attemptId: "attempt-real" });
    finalizeMascotPackage.mockResolvedValue(finalized);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("falha fechada fora de Preview antes de autenticar", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { POST } = await import("@/app/api/internal/staging-complete-approved-job/route");
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(requireBrowserIdentity).not.toHaveBeenCalled();
  });

  it("exige uma sessão Supabase", async () => {
    requireBrowserIdentity.mockResolvedValue({ uid: ownerId, mode: "development" });
    const { POST } = await import("@/app/api/internal/staging-complete-approved-job/route");
    const response = await POST(request());
    await expect(response.json()).resolves.toEqual({ code: "SESSION_REQUIRED" });
    expect(finalizeMascotPackage).not.toHaveBeenCalled();
  });

  it("usa somente o job aprovado definido no servidor", async () => {
    const { POST } = await import("@/app/api/internal/staging-complete-approved-job/route");
    const response = await POST(request({ jobId: "arbitrario", packageId: "arbitrario" }));
    expect(response.status).toBe(200);
    expect(requirePreviewFixtureOwner).toHaveBeenCalledWith(ownerId);
    expect(resolvePreviewApprovedJobBinding).toHaveBeenCalledWith(client, ownerId);
    expect(finalizeMascotPackage).toHaveBeenCalledWith({
      client,
      userId: ownerId,
      attemptId: "attempt-real",
      jobId: "job_43136e0b5283358281bc1d4c6efa8c01",
      displayName: "Mascote GRU",
    });
  });

  it("devolve somente metadados sanitizados depois de ready", async () => {
    const { POST } = await import("@/app/api/internal/staging-complete-approved-job/route");
    const response = await POST(request());
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      itemId: "87654321…9abc",
      packageId: "12345678…cdef",
      status: "ready",
      poseCount: 3,
      roles: ["NORMAL", "LISTENING", "TRANSCRIBING"],
      importAvailable: true,
    });
  });
});

function request(body: Record<string, unknown> = {}) {
  return new Request("https://preview.example/api/internal/staging-complete-approved-job", {
    method: "POST",
    headers: {
      origin: "https://preview.example",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}
