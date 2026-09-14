import { beforeEach, describe, expect, it, vi } from "vitest";

const requireBrowserIdentity = vi.fn();
const requireTrustedMutationRequest = vi.fn();
const createClient = vi.fn();
const findAttemptByJobId = vi.fn();
const findIncubationRecovery = vi.fn();
const retireIncubationAttempt = vi.fn();
const createAdminClient = vi.fn();

vi.mock("@/lib/auth/browser-auth", () => ({ authErrorResponse: vi.fn(() => null), requireBrowserIdentity }));
vi.mock("@/lib/security/mutation-request", () => ({ requireTrustedMutationRequest }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/mascot-generation/attempt-store", () => ({ findAttemptByJobId }));
vi.mock("@/lib/mascot-generation/incubation-recovery-store", () => ({ findIncubationRecovery, retireIncubationAttempt }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const OWNER_ID = "owner-123";
const JOB_ID = "job-orphan-123";
const attempt = { attempt_id: "attempt-orphan-123456", modal_job_id: JOB_ID, user_id: OWNER_ID, workflow_mode: "async_incubator_v1" };

describe("POST /api/mascot/incubations/[jobId]/retire", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: OWNER_ID });
    createClient.mockResolvedValue({});
    createAdminClient.mockReturnValue({});
    findAttemptByJobId.mockResolvedValue(attempt);
    findIncubationRecovery.mockResolvedValue({ status: "CONFIRMED_MISSING", errorCode: "INCUBATION_JOB_GONE", retiredAt: null });
    retireIncubationAttempt.mockResolvedValue({ status: "RETIRED", retiredAt: "2026-09-14T12:00:00.000Z" });
  });

  it("retira um nascimento órfão sem excluir a tentativa", async () => {
    const { POST } = await import("@/app/api/mascot/incubations/[jobId]/retire/route");
    const response = await POST(new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}/retire`, { method: "POST", headers: { origin: "https://puleiro.test" } }), { params: Promise.resolve({ jobId: JOB_ID }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ retired: true });
    expect(retireIncubationAttempt).toHaveBeenCalledWith({}, OWNER_ID, attempt.attempt_id, JOB_ID);
  });

  it("rejeita a retirada quando a tentativa não falhou nem perdeu o vínculo", async () => {
    findIncubationRecovery.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/mascot/incubations/[jobId]/retire/route");
    const response = await POST(new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}/retire`, { method: "POST", headers: { origin: "https://puleiro.test" } }), { params: Promise.resolve({ jobId: JOB_ID }) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "INCUBATION_RETIRE_NOT_ALLOWED" });
    expect(retireIncubationAttempt).not.toHaveBeenCalled();
  });

  it("permite retirar uma tentativa que terminou em falha", async () => {
    findAttemptByJobId.mockResolvedValueOnce({ ...attempt, status: "failed", last_error_code: "POSE_GENERATION_FAILED" });
    findIncubationRecovery.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/mascot/incubations/[jobId]/retire/route");
    const response = await POST(new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}/retire`, { method: "POST", headers: { origin: "https://puleiro.test" } }), { params: Promise.resolve({ jobId: JOB_ID }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ retired: true, idempotentReplay: false });
    expect(retireIncubationAttempt).toHaveBeenCalledWith({}, OWNER_ID, attempt.attempt_id, JOB_ID, "POSE_GENERATION_FAILED");
  });

  it("não permite retirar uma tentativa que ainda está em andamento", async () => {
    findAttemptByJobId.mockResolvedValueOnce({ ...attempt, status: "generating_poses" });
    findIncubationRecovery.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/mascot/incubations/[jobId]/retire/route");
    const response = await POST(new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}/retire`, { method: "POST", headers: { origin: "https://puleiro.test" } }), { params: Promise.resolve({ jobId: JOB_ID }) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "INCUBATION_RETIRE_NOT_ALLOWED" });
    expect(retireIncubationAttempt).not.toHaveBeenCalled();
  });
});
