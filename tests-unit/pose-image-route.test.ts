import { beforeEach, describe, expect, it, vi } from "vitest";

const requireBrowserIdentity = vi.fn();
const getAttemptId = vi.fn();
const findAttempt = vi.fn();
const findAttemptByJobId = vi.fn();
const createClient = vi.fn();
const getPoseImage = vi.fn();
const getMascotGenerationProvider = vi.fn(() => ({ getPoseImage }));

vi.mock("@/lib/auth/browser-auth", () => ({ requireBrowserIdentity }));
vi.mock("@/lib/mascot-generation/attempt", () => ({
  getAttemptId,
  jobIdentity: (ownerId: string, attemptId: string) => ({ ownerId, attemptId, requestId: "request" }),
}));
vi.mock("@/lib/mascot-generation/attempt-store", () => ({ findAttempt, findAttemptByJobId }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/mascot-generation/provider", () => ({ getMascotGenerationProvider }));
vi.mock("@/lib/mascot-generation/asset-cache", () => ({ getCachedMascotAsset: (_key: string, load: () => unknown) => load() }));
vi.mock("@/lib/mascot-generation/display-asset", () => ({ prepareMascotDisplayAsset: (image: unknown) => image }));

describe("Pose image BFF route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: "qa-owner", mode: "supabase-session" });
    getAttemptId.mockResolvedValue(undefined);
    createClient.mockResolvedValue({});
    findAttemptByJobId.mockResolvedValue({ attempt_id: "attempt_async_123", workflow_mode: "async_incubator_v1", modal_job_id: "job_async_123" });
    getPoseImage.mockResolvedValue({ bytes: Uint8Array.from([1, 2, 3]), contentType: "image/png" });
  });

  it("resolve pose por attempt async persistido sem cookie", async () => {
    const { GET } = await import("@/app/api/mascot/jobs/[jobId]/pose/[role]/route");
    const response = await GET(new Request("https://puleiro.test"), { params: Promise.resolve({ jobId: "job_async_123", role: "normal" }) });
    expect(response.status).toBe(200);
    expect(getPoseImage).toHaveBeenCalledWith("job_async_123", "normal", expect.objectContaining({ ownerId: "qa-owner", attemptId: "attempt_async_123" }));
  });

  it("não consulta provider quando o job não pertence ao owner", async () => {
    findAttemptByJobId.mockResolvedValue(null);
    const { GET } = await import("@/app/api/mascot/jobs/[jobId]/pose/[role]/route");
    const response = await GET(new Request("https://puleiro.test"), { params: Promise.resolve({ jobId: "job_async_123", role: "normal" }) });
    expect(response.status).toBe(404);
    expect(getPoseImage).not.toHaveBeenCalled();
  });
});
