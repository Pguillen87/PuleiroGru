import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostBirthStoreError } from "@/lib/mascot-generation/post-birth-store";

const requireTrustedMutationRequest = vi.fn();
const requireBrowserIdentity = vi.fn();
const createClient = vi.fn();
const findAttemptByJobId = vi.fn();
const postBirthStoreMocks = vi.hoisted(() => ({
  findPostBirthProfile: vi.fn(),
  activatePostBirthProfile: vi.fn(),
}));
const { findPostBirthProfile, activatePostBirthProfile } = postBirthStoreMocks;

vi.mock("@/lib/security/mutation-request", () => ({ requireTrustedMutationRequest }));
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
vi.mock("@/lib/mascot-generation/attempt-store", () => ({ findAttemptByJobId }));
vi.mock("@/lib/mascot-generation/post-birth-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mascot-generation/post-birth-store")>("@/lib/mascot-generation/post-birth-store");
  return {
    ...actual,
    findPostBirthProfile: postBirthStoreMocks.findPostBirthProfile,
    activatePostBirthProfile: postBirthStoreMocks.activatePostBirthProfile,
  };
});

const OWNER_ID = "owner-123";
const ATTEMPT_ID = "attempt-post-birth-0001";
const JOB_ID = "job-post-birth-0001";
const client = {};

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
    ...overrides,
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
    findAttemptByJobId.mockResolvedValue(createAttempt());
    findPostBirthProfile.mockResolvedValue(createProfile());
    activatePostBirthProfile.mockResolvedValue(createProfile({ state: "ACTIVE", activatedAt: "2026-09-07T13:00:00.000Z" }));
  });

  it("ativa atomicamente um perfil DRAFT hatched", async () => {
    const response = await post({ configurationRevision: 2 }, "activate-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ profile: { state: "ACTIVE", id: "profile-1" } });
    expect(requireTrustedMutationRequest).toHaveBeenCalledWith(expect.any(Request), { contentTypes: ["application/json"] });
    expect(activatePostBirthProfile).toHaveBeenCalledWith(client, OWNER_ID, ATTEMPT_ID, 2);
  });

  it("faz replay sem nova escrita quando o perfil já está ACTIVE", async () => {
    const active = createProfile({ state: "ACTIVE", activatedAt: "2026-09-07T13:00:00.000Z" });
    findPostBirthProfile.mockResolvedValueOnce(active);

    const response = await post({}, "activate-replay");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ profile: { state: "ACTIVE" }, idempotentReplay: true });
    expect(activatePostBirthProfile).not.toHaveBeenCalled();
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
    expect(activatePostBirthProfile).not.toHaveBeenCalled();
  });

  it("mapeia perfil ausente, sessão ausente, conflito e banco indisponível", async () => {
    findPostBirthProfile.mockResolvedValueOnce(null);
    const notFound = await post({ configurationRevision: 2 }, "activate-4");
    expect(notFound.status).toBe(404);

    requireBrowserIdentity.mockRejectedValueOnce({ status: 401, code: "SESSION_EXPIRED" });
    const unauthorized = await post({ configurationRevision: 2 }, "activate-5");
    expect(unauthorized.status).toBe(401);

    activatePostBirthProfile.mockRejectedValueOnce(new PostBirthStoreError("POST_BIRTH_PROFILE_CONFLICT"));
    const conflict = await post({ configurationRevision: 2 }, "activate-6");
    expect(conflict.status).toBe(409);

    activatePostBirthProfile.mockRejectedValueOnce(new PostBirthStoreError("POST_BIRTH_PROFILE_ACTIVATE_FAILED"));
    const unavailable = await post({ configurationRevision: 2 }, "activate-7");
    expect(unavailable.status).toBe(503);
  });
});
