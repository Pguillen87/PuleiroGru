import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostBirthStoreError } from "@/lib/mascot-generation/post-birth-store";
import { PostBirthValidationError } from "@/lib/mascot-generation/post-birth-validation";

const requireTrustedMutationRequest = vi.fn();
const requireBrowserIdentity = vi.fn();
const createClient = vi.fn();
const findAttemptByJobId = vi.fn();
const postBirthStoreMocks = vi.hoisted(() => ({
  findPostBirthProfile: vi.fn(),
  updatePostBirthProfileDraft: vi.fn(),
}));
const { findPostBirthProfile, updatePostBirthProfileDraft } = postBirthStoreMocks;

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
    updatePostBirthProfileDraft: postBirthStoreMocks.updatePostBirthProfileDraft,
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

function request(method: "GET" | "PATCH", body?: unknown) {
  return new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}/profile`, {
    method,
    headers: method === "PATCH"
      ? { origin: "https://puleiro.test", "content-type": "application/json" }
      : undefined,
    body: method === "PATCH" ? JSON.stringify(body ?? {}) : undefined,
  });
}

async function callRoute(method: "GET" | "PATCH", body?: unknown) {
  const route = await import("@/app/api/mascot/incubations/[jobId]/profile/route");
  return method === "GET"
    ? route.GET(request(method), { params: Promise.resolve({ jobId: JOB_ID }) })
    : route.PATCH(request(method, body), { params: Promise.resolve({ jobId: JOB_ID }) });
}

describe("/api/mascot/incubations/[jobId]/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: OWNER_ID, mode: "supabase-session" });
    createClient.mockResolvedValue(client);
    findAttemptByJobId.mockResolvedValue(createAttempt());
    findPostBirthProfile.mockResolvedValue(createProfile());
    updatePostBirthProfileDraft.mockResolvedValue(createProfile({ configurationRevision: 3, displayName: "Novo Nome" }));
  });

  it("GET retorna apenas o perfil do job async já hatched", async () => {
    const response = await callRoute("GET");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ profile: { id: "profile-1", state: "DRAFT" } });
    expect(findAttemptByJobId).toHaveBeenCalledWith(client, OWNER_ID, JOB_ID);
    expect(findPostBirthProfile).toHaveBeenCalledWith(client, OWNER_ID, ATTEMPT_ID);
  });

  it.each([
    ["workflow incompatível", { workflow_mode: "legacy_v1" }],
    ["ainda não hatched", { hatched_at: null }],
  ])("GET retorna 404 quando o job está %s", async (_caseName, overrides) => {
    findAttemptByJobId.mockResolvedValueOnce(createAttempt(overrides));

    const response = await callRoute("GET");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "POST_BIRTH_PROFILE_NOT_AVAILABLE" });
    expect(findPostBirthProfile).not.toHaveBeenCalled();
  });

  it("GET converte sessão ausente em 401", async () => {
    requireBrowserIdentity.mockRejectedValueOnce({ status: 401, code: "SESSION_EXPIRED" });

    const response = await callRoute("GET");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("PATCH atualiza nome e jornal usando a revisão esperada", async () => {
    const response = await callRoute("PATCH", {
      configurationRevision: 2,
      display_name: "Novo Nome",
      journal_config: { version: 1 },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ profile: { configurationRevision: 3, displayName: "Novo Nome" } });
    expect(requireTrustedMutationRequest).toHaveBeenCalledWith(expect.any(Request), { contentTypes: ["application/json"] });
    expect(updatePostBirthProfileDraft).toHaveBeenCalledWith(client, OWNER_ID, ATTEMPT_ID, {
      expectedRevision: 2,
      displayName: "Novo Nome",
      journalConfig: { version: 1 },
    });
  });

  it("PATCH rejeita revisão ausente ou inválida antes de escrever", async () => {
    const response = await callRoute("PATCH", { display_name: "Novo Nome" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "CONFIGURATION_REVISION_REQUIRED" });
    expect(updatePostBirthProfileDraft).not.toHaveBeenCalled();
  });

  it("PATCH mapeia validação do domínio para 400", async () => {
    updatePostBirthProfileDraft.mockRejectedValueOnce(new PostBirthValidationError("INVALID_DISPLAY_NAME", "Nome inválido."));

    const response = await callRoute("PATCH", { configurationRevision: 2, display_name: "A" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_DISPLAY_NAME" });
  });

  it("PATCH mapeia conflito de revisão para 409 e falha de banco para 503", async () => {
    updatePostBirthProfileDraft.mockRejectedValueOnce(new PostBirthStoreError("POST_BIRTH_PROFILE_CONFLICT"));
    const conflict = await callRoute("PATCH", { configurationRevision: 2, display_name: "Novo Nome" });
    expect(conflict.status).toBe(409);

    updatePostBirthProfileDraft.mockRejectedValueOnce(new PostBirthStoreError("POST_BIRTH_PROFILE_UPDATE_FAILED"));
    const unavailable = await callRoute("PATCH", { configurationRevision: 2, display_name: "Novo Nome" });
    expect(unavailable.status).toBe(503);
  });
});
