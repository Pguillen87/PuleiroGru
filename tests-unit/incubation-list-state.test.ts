import { beforeEach, describe, expect, it, vi } from "vitest";

const requireBrowserIdentity = vi.fn();
const createClient = vi.fn();
const findIncubationAttempts = vi.fn();
const getMascotGenerationProvider = vi.fn();

vi.mock("@/lib/auth/browser-auth", () => ({
  authErrorResponse: vi.fn(() => null),
  requireBrowserIdentity,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/mascot-generation/attempt-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/mascot-generation/attempt-store")>(),
  findIncubationAttempts,
}));
vi.mock("@/lib/mascot-generation/provider", () => ({ getMascotGenerationProvider }));

const ownerId = "8e558341-61cf-4a4a-9773-35f20f4c194e";
const attempt = {
  id: "attempt-row", user_id: ownerId, attempt_id: "incubator-attempt", modal_job_id: "job-1",
  status: "awaiting_set_approval", selected_master_id: null, workflow_mode: "async_incubator_v1",
  generation_ready_at: "2026-08-29T01:00:00Z", hatched_at: "2026-08-29T02:00:00Z",
  created_at: "2026-08-29T00:00:00Z", updated_at: "2026-08-29T02:00:00Z",
};

describe("GET /api/mascot/incubations state projection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: ownerId });
    createClient.mockResolvedValue({});
    findIncubationAttempts.mockResolvedValue([attempt]);
    getMascotGenerationProvider.mockReturnValue({
      getJob: vi.fn().mockResolvedValue({
        id: "job-1", attemptId: attempt.attempt_id, status: "awaiting_set_approval", productState: "READY_TO_HATCH",
        generationScheduled: false, masters: [], subjectIdentity: { category: "animal", label: "arara", species: "arara", confirmed: true },
        poseChoices: {}, configuration: {}, poses: [], message: "pronto",
      }),
    });
  });

  it("prioriza hatched_at sobre READY_TO_HATCH retornado pelo Modal", async () => {
    const { GET } = await import("@/app/api/mascot/incubations/route");
    const response = await GET(new Request("https://puleiro.test/api/mascot/incubations"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ incubations: [{ jobId: "job-1", productState: "HATCHED" }] });
  });
});
