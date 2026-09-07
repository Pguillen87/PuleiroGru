import { describe, expect, it, vi } from "vitest";
import {
  PostBirthValidationError,
  normalizePostBirthDisplayName,
  validateJournalConfig,
} from "@/lib/mascot-generation/post-birth-validation";
import {
  activatePostBirthProfile,
  createPostBirthProfileDraft,
  findPostBirthProfile,
  updatePostBirthProfileDraft,
} from "@/lib/mascot-generation/post-birth-store";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const ATTEMPT_ID = "attempt-post-birth-0001";
const JOB_ID = "job-post-birth-0001";

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null };

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    returns: vi.fn(async () => result),
  };
  return query;
}

function createClient(query: ReturnType<typeof createQuery>) {
  return { from: vi.fn(() => query) } as never;
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    user_id: USER_ID,
    attempt_id: ATTEMPT_ID,
    modal_job_id: JOB_ID,
    state: "DRAFT",
    display_name: "Puleiro",
    journal_config: { version: 1 },
    configuration_revision: 2,
    created_at: "2026-09-07T12:00:00.000Z",
    updated_at: "2026-09-07T12:00:00.000Z",
    activated_at: null,
    ...overrides,
  };
}

describe("post-birth validation", () => {
  it("accepts display names at the two and 32 character boundaries", () => {
    expect(normalizePostBirthDisplayName("AB")).toBe("AB");
    expect(normalizePostBirthDisplayName("A".repeat(32))).toBe("A".repeat(32));
  });

  it("rejects display names outside the allowed character range", () => {
    expect(() => normalizePostBirthDisplayName("A")).toThrow(PostBirthValidationError);
    expect(() => normalizePostBirthDisplayName("A".repeat(33))).toThrow(PostBirthValidationError);
    try {
      normalizePostBirthDisplayName("A");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_DISPLAY_NAME", status: 400 });
    }
  });

  it("accepts only the supported versioned journal configuration shape", () => {
    expect(validateJournalConfig({ version: 1 })).toEqual({ version: 1 });
    expect(() => validateJournalConfig(null)).toThrow(PostBirthValidationError);
    expect(() => validateJournalConfig({})).toThrow(PostBirthValidationError);
    expect(() => validateJournalConfig({ version: 1, extra: true })).toThrow(PostBirthValidationError);
  });
});

describe("post-birth profile store", () => {
  it("reads a profile with an explicit owner scope and maps database fields", async () => {
    const query = createQuery({ data: profileRow(), error: null });
    const result = await findPostBirthProfile(createClient(query), USER_ID, ATTEMPT_ID);

    expect(result).toMatchObject({
      id: "profile-1",
      userId: USER_ID,
      attemptId: ATTEMPT_ID,
      modalJobId: JOB_ID,
      state: "DRAFT",
      displayName: "Puleiro",
      journalConfig: { version: 1 },
      configurationRevision: 2,
    });
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(query.eq).toHaveBeenCalledWith("attempt_id", ATTEMPT_ID);
  });

  it("creates a draft with normalized validated data and default configuration", async () => {
    const query = createQuery({ data: profileRow({ display_name: "Meu Mascote" }), error: null });
    const client = createClient(query);

    const result = await createPostBirthProfileDraft(client, USER_ID, {
      attemptId: ATTEMPT_ID,
      modalJobId: JOB_ID,
      displayName: "  Meu   Mascote  ",
    });

    expect(result.displayName).toBe("Meu Mascote");
    expect(query.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      attempt_id: ATTEMPT_ID,
      modal_job_id: JOB_ID,
      state: "DRAFT",
      display_name: "Meu Mascote",
      journal_config: { version: 1 },
      configuration_revision: 0,
    });
  });

  it("lists only active profiles within the authenticated owner scope", async () => {
    const query = createQuery({ data: [profileRow({ state: "ACTIVE", display_name: "Pipoca" })], error: null });
    const { listActivePostBirthProfiles } = await import("@/lib/mascot-generation/post-birth-store");

    const result = await listActivePostBirthProfiles(createClient(query), USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ state: "ACTIVE", displayName: "Pipoca" });
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(query.eq).toHaveBeenCalledWith("state", "ACTIVE");
    expect(query.not).toHaveBeenCalledWith("display_name", "is", null);
    expect(query.limit).toHaveBeenCalledWith(24);
  });

  it("updates only a draft at the expected configuration revision", async () => {
    const query = createQuery({ data: profileRow({ configuration_revision: 3 }), error: null });
    const result = await updatePostBirthProfileDraft(createClient(query), USER_ID, ATTEMPT_ID, {
      expectedRevision: 2,
      displayName: "Novo Nome",
      journalConfig: { version: 1 },
    });

    expect(result.configurationRevision).toBe(3);
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(query.eq).toHaveBeenCalledWith("attempt_id", ATTEMPT_ID);
    expect(query.eq).toHaveBeenCalledWith("state", "DRAFT");
    expect(query.eq).toHaveBeenCalledWith("configuration_revision", 2);
    expect(query.update).toHaveBeenCalledWith({
      display_name: "Novo Nome",
      journal_config: { version: 1 },
      configuration_revision: 3,
    });
  });

  it("activates a draft with an idempotent state transition", async () => {
    const query = createQuery({
      data: profileRow({ state: "ACTIVE", activated_at: "2026-09-07T13:00:00.000Z" }),
      error: null,
    });
    const result = await activatePostBirthProfile(createClient(query), USER_ID, ATTEMPT_ID, 2);

    expect(result.state).toBe("ACTIVE");
    expect(result.activatedAt).toBe("2026-09-07T13:00:00.000Z");
    expect(query.eq).toHaveBeenCalledWith("state", "DRAFT");
    expect(query.eq).toHaveBeenCalledWith("configuration_revision", 2);
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      state: "ACTIVE",
      activated_at: expect.any(String),
    }));
  });

  it("fails closed with a typed store error when Supabase fails", async () => {
    const query = createQuery({ data: null, error: { code: "PGRST001", message: "database unavailable" } });

    await expect(findPostBirthProfile(createClient(query), USER_ID, ATTEMPT_ID))
      .rejects.toMatchObject({ code: "POST_BIRTH_PROFILE_READ_FAILED", status: 503 });
  });

  it("exposes stable validation error codes for the future HTTP boundary", () => {
    try {
      validateJournalConfig({ version: 2 });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PostBirthValidationError);
      expect((error as PostBirthValidationError).code).toBe("INVALID_JOURNAL_CONFIG");
    }
  });
});
