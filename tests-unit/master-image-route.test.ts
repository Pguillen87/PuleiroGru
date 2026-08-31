import { beforeEach, describe, expect, it, vi } from "vitest";

const requireBrowserIdentity = vi.fn();
const getAttemptId = vi.fn();
const findAttempt = vi.fn();
const findAttemptByJobId = vi.fn();
const createClient = vi.fn();
const getMasterImage = vi.fn();
const getMascotGenerationProvider = vi.fn(() => ({ getMasterImage }));

vi.mock("@/lib/auth/browser-auth", () => ({ requireBrowserIdentity }));
vi.mock("@/lib/mascot-generation/attempt", () => ({
  getAttemptId,
  jobIdentity: (ownerId: string, attemptId: string) => ({ ownerId, attemptId, requestId: "request" }),
}));
vi.mock("@/lib/mascot-generation/attempt-store", () => ({ findAttempt, findAttemptByJobId }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/mascot-generation/provider", () => ({ getMascotGenerationProvider }));

describe("Master image BFF route", () => {
  const jobId = "job_async_123";
  const attempt = { attempt_id: "attempt_async_123", workflow_mode: "async_incubator_v1", modal_job_id: jobId };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: "qa-owner", mode: "supabase-session" });
    getAttemptId.mockResolvedValue(undefined);
    createClient.mockResolvedValue({});
    findAttemptByJobId.mockResolvedValue(attempt);
    getMasterImage.mockResolvedValue({ bytes: Uint8Array.from([137, 80, 78, 71]), contentType: "image/png" });
  });

  it("recupera o attempt async por job owner-scoped sem cookie e serve a imagem", async () => {
    const { GET } = await import("@/app/api/mascot/jobs/[jobId]/master/[masterId]/route");
    const response = await GET(new Request("https://puleiro.test"), { params: Promise.resolve({ jobId, masterId: "master_1" }) });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([137, 80, 78, 71]));
    expect(findAttemptByJobId).toHaveBeenCalledWith({}, "qa-owner", jobId);
    expect(getMasterImage).toHaveBeenCalledWith(jobId, "master_1", expect.objectContaining({ ownerId: "qa-owner", attemptId: attempt.attempt_id }));
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(findAttempt).not.toHaveBeenCalled();
  });

  it("não vaza imagem para outro owner ou job sem vínculo", async () => {
    findAttemptByJobId.mockResolvedValue(null);
    const { GET } = await import("@/app/api/mascot/jobs/[jobId]/master/[masterId]/route");
    const response = await GET(new Request("https://puleiro.test"), { params: Promise.resolve({ jobId, masterId: "master_1" }) });
    expect(response.status).toBe(404);
    expect(getMasterImage).not.toHaveBeenCalled();
  });

  it("rejeita identificador inválido antes do provider", async () => {
    const { GET } = await import("@/app/api/mascot/jobs/[jobId]/master/[masterId]/route");
    const response = await GET(new Request("https://puleiro.test"), { params: Promise.resolve({ jobId: "../other", masterId: "master_1" }) });
    expect(response.status).toBe(400);
    expect(getMasterImage).not.toHaveBeenCalled();
  });
});
