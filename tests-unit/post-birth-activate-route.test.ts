import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostBirthStoreError } from "@/lib/mascot-generation/post-birth-store";

const requireTrustedMutationRequest = vi.fn();
const requireBrowserIdentity = vi.fn();
const createClient = vi.fn();
const createAdminClient = vi.fn();
const findAttemptByJobId = vi.fn();
const getMascotGenerationProvider = vi.fn();
const persistApprovedPoseSet = vi.fn();
const postBirthStoreMocks = vi.hoisted(() => ({
  findPostBirthProfile: vi.fn(),
  completePostBirthProfile: vi.fn(),
}));
const { findPostBirthProfile, completePostBirthProfile } = postBirthStoreMocks;

vi.mock("@/lib/security/mutation-request", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/security/mutation-request")>(),
  requireTrustedMutationRequest,
}));
vi.mock("@/lib/auth/browser-auth", () => ({
  requireBrowserIdentity,
  authErrorResponse: (error: unknown) => {
    if (!error || typeof error !== "object" || !("status" in error)) return undefined;
    const typed = error as { status?: number; code?: string; message?: string };
    return typeof typed.status === "number"
      ? Response.json({ code: typed.code ?? "SESSION_EXPIRED", message: typed.message ?? "Não autenticado." }, { status: typed.status })
      : undefined;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/mascot-generation/attempt-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/mascot-generation/attempt-store")>(),
  findAttemptByJobId,
}));
vi.mock("@/lib/mascot-generation/provider", () => ({ getMascotGenerationProvider }));
vi.mock("@/lib/mascot-generation/approved-pose-store", () => ({ persistApprovedPoseSet }));
vi.mock("@/lib/mascot-generation/library-store", () => ({ createMascotCode: vi.fn(() => "GRU-AAAA-BBBB") }));
vi.mock("@/lib/mascot-generation/post-birth-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mascot-generation/post-birth-store")>("@/lib/mascot-generation/post-birth-store");
  return {
    ...actual,
    findPostBirthProfile: postBirthStoreMocks.findPostBirthProfile,
    completePostBirthProfile: postBirthStoreMocks.completePostBirthProfile,
  };
});

const OWNER_ID = "owner-123";
const ATTEMPT_ID = "attempt-post-birth-0001";
const JOB_ID = "job-post-birth-0001";
const client = {};
const admin = {};

function createAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    user_id: OWNER_ID,
    attempt_id: ATTEMPT_ID,
    modal_job_id: JOB_ID,
    workflow_mode: "async_incubator_v1",
    hatched_at: "2026-09-07T12:00:00.000Z",
    ...overrides,
  };
}

function createProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    userId: OWNER_ID,
    attemptId: ATTEMPT_ID,
    modalJobId: JOB_ID,
    state: "DRAFT",
    displayName: "Puleiro",
    journalConfig: { version: 1 },
    configurationRevision: 2,
    createdAt: "2026-09-07T12:00:00.000Z",
    updatedAt: "2026-09-07T12:00:00.000Z",
    activatedAt: null,
    libraryItemId: null,
    ...overrides,
  };
}

function createJob() {
  return {
    id: JOB_ID,
    attemptId: ATTEMPT_ID,
    approvedMasterId: "master-1",
    poses: [
      { id: "pose-1", role: "normal", optionId: "normal-1", label: "Normal", imageUrl: "" },
      { id: "pose-2", role: "listening", optionId: "listening-1", label: "Ouvindo", imageUrl: "" },
      { id: "pose-3", role: "transcribing", optionId: "transcribing-1", label: "Transcrevendo", imageUrl: "" },
    ],
    poseSetQc: { status: "passed", version: "pose-set-visual-v3" },
  };
}

function request(body: unknown = {}, idempotencyKey?: string) {
  const headers = new Headers({ origin: "https://puleiro.test", "content-type": "application/json" });
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}/activate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function post(body?: unknown, idempotencyKey?: string) {
  const route = await import("@/app/api/mascot/incubations/[jobId]/activate/route");
  return route.POST(request(body, idempotencyKey), { params: Promise.resolve({ jobId: JOB_ID }) });
}

describe("POST /api/mascot/incubations/[jobId]/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: OWNER_ID, mode: "supabase-session" });
    createClient.mockResolvedValue(client);
    createAdminClient.mockReturnValue(admin);
    findAttemptByJobId.mockResolvedValue(createAttempt());
    findPostBirthProfile.mockResolvedValue(createProfile());
    completePostBirthProfile.mockResolvedValue({
      profile: createProfile({ state: "ACTIVE", activatedAt: "2026-09-07T13:00:00.000Z", libraryItemId: "item-1" }),
      libraryItem: { id: "item-1", displayName: "Puleiro", mascotCode: "GRU-AAAA-BBBB" },
      idempotentReplay: false,
    });
    persistApprovedPoseSet.mockResolvedValue({ id: "pose-set-1", assets: [], idempotentReplay: false });
    getMascotGenerationProvider.mockReturnValue({ getJob: vi.fn().mockResolvedValue(createJob()) });
  });

  it("ativa atomicamente um perfil DRAFT hatched", async () => {
    const response = await post({ configurationRevision: 2 }, "activate-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ profile: { state: "ACTIVE", id: "profile-1" } });
    expect(requireTrustedMutationRequest).toHaveBeenCalledWith(expect.any(Request), { contentTypes: ["application/json"] });
    expect(completePostBirthProfile).toHaveBeenCalledWith(client, OWNER_ID, ATTEMPT_ID, expect.objectContaining({
      expectedRevision: 2,
      displayName: "Puleiro",
      modalJobId: JOB_ID,
      masterId: "master-1",
      mascotCode: "GRU-AAAA-BBBB",
    }), admin);
  });

  it("faz replay sem nova escrita quando o perfil já está ACTIVE", async () => {
    const active = createProfile({ state: "ACTIVE", activatedAt: "2026-09-07T13:00:00.000Z", libraryItemId: "item-1" });
    findPostBirthProfile.mockResolvedValueOnce(active);

    const response = await post({}, "activate-replay");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ profile: { state: "ACTIVE" }, idempotentReplay: true });
    expect(completePostBirthProfile).not.toHaveBeenCalled();
  });

  it("retorna 400 para chave de idempotência inválida ou revisão ausente", async () => {
    const invalidKey = await post({ configurationRevision: 2 }, " ".repeat(129));
    expect(invalidKey.status).toBe(400);

    const missingRevision = await post({}, "activate-2");
    expect(missingRevision.status).toBe(400);
    await expect(missingRevision.json()).resolves.toMatchObject({ code: "CONFIGURATION_REVISION_REQUIRED" });
  });

  it("retorna 400 quando o nome ainda não foi definido", async () => {
    findPostBirthProfile.mockResolvedValueOnce(createProfile({ displayName: null }));

    const response = await post({ configurationRevision: 2 }, "activate-3");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "DISPLAY_NAME_REQUIRED" });
    expect(completePostBirthProfile).not.toHaveBeenCalled();
  });

  it("mapeia perfil ausente, sessão ausente, conflito e banco indisponível", async () => {
    findPostBirthProfile.mockResolvedValueOnce(null);
    const notFound = await post({ configurationRevision: 2 }, "activate-4");
    expect(notFound.status).toBe(404);

    requireBrowserIdentity.mockRejectedValueOnce({ status: 401, code: "SESSION_EXPIRED" });
    const unauthorized = await post({ configurationRevision: 2 }, "activate-5");
    expect(unauthorized.status).toBe(401);

    completePostBirthProfile.mockRejectedValueOnce(new PostBirthStoreError("POST_BIRTH_PROFILE_CONFLICT"));
    const conflict = await post({ configurationRevision: 2 }, "activate-6");
    expect(conflict.status).toBe(409);

    completePostBirthProfile.mockRejectedValueOnce(new PostBirthStoreError("POST_BIRTH_PROFILE_COMPLETE_FAILED"));
    const unavailable = await post({ configurationRevision: 2 }, "activate-7");
    expect(unavailable.status).toBe(503);
  });
});
