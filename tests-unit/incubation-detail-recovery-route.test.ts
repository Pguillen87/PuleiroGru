import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MascotAttempt } from "@/lib/mascot-generation/attempt-store";
import type { GenerationJob } from "@/lib/mascot-generation/types";

const requireBrowserIdentity = vi.fn();
const createClient = vi.fn();
const createAdminClient = vi.fn();
const findAttemptByJobId = vi.fn();
const findIncubationRecovery = vi.fn();
const markIncubationJobMissing = vi.fn();
const getMascotGenerationProvider = vi.fn();
const saveAttemptJob = vi.fn();

vi.mock("@/lib/auth/browser-auth", () => ({ authErrorResponse: vi.fn(() => null), requireBrowserIdentity }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/mascot-generation/attempt-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/mascot-generation/attempt-store")>(),
  findAttemptByJobId,
  saveAttemptJob,
  projectIncubationJob: (job: GenerationJob) => job,
}));
vi.mock("@/lib/mascot-generation/incubation-recovery-store", () => ({ findIncubationRecovery, markIncubationJobMissing }));
vi.mock("@/lib/mascot-generation/provider", () => ({ getMascotGenerationProvider }));

const OWNER_ID = "owner-detail";
const ATTEMPT_ID = "attempt-detail-123456";
const JOB_ID = "job-detail-123";

const attempt = {
  user_id: OWNER_ID,
  attempt_id: ATTEMPT_ID,
  modal_job_id: JOB_ID,
  workflow_mode: "async_incubator_v1",
} as MascotAttempt;

describe("GET /api/mascot/incubations/[jobId] recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: OWNER_ID });
    createClient.mockResolvedValue({});
    createAdminClient.mockReturnValue({});
    findAttemptByJobId.mockResolvedValue(attempt);
    findIncubationRecovery.mockResolvedValue(null);
    markIncubationJobMissing.mockResolvedValue({ errorCode: "INCUBATION_JOB_GONE", lastObservedAt: "2026-09-14T12:00:00.000Z" });
  });

  it("responde 410 e registra o job ausente", async () => {
    getMascotGenerationProvider.mockReturnValue({ lookupJob: vi.fn().mockResolvedValue({ kind: "not_found" }) });
    const { GET } = await import("@/app/api/mascot/incubations/[jobId]/route");
    const response = await GET(new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}`), { params: Promise.resolve({ jobId: JOB_ID }) });
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "INCUBATION_JOB_GONE" });
    expect(markIncubationJobMissing).toHaveBeenCalledWith({}, OWNER_ID, ATTEMPT_ID, JOB_ID);
  });

  it("responde 503 quando o Modal está indisponível", async () => {
    const { ModalProviderError } = await import("@/lib/mascot-generation/modal-provider");
    getMascotGenerationProvider.mockReturnValue({ lookupJob: vi.fn().mockResolvedValue({ kind: "unavailable", error: new ModalProviderError(503, "TEMPORARILY_UNAVAILABLE", "down") }) });
    const { GET } = await import("@/app/api/mascot/incubations/[jobId]/route");
    const response = await GET(new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}`), { params: Promise.resolve({ jobId: JOB_ID }) });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE" });
    expect(markIncubationJobMissing).not.toHaveBeenCalled();
  });

  it("responde 404 quando o job não pertence ao usuário autenticado", async () => {
    findAttemptByJobId.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/mascot/incubations/[jobId]/route");
    const response = await GET(new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}`), { params: Promise.resolve({ jobId: JOB_ID }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "JOB_NOT_FOUND" });
    expect(getMascotGenerationProvider).not.toHaveBeenCalled();
  });
});
