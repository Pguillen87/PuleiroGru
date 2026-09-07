import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MascotAttempt } from "@/lib/mascot-generation/attempt-store";
import type { GeneratedPose, GenerationJob, PoseRole } from "@/lib/mascot-generation/types";

const requireBrowserIdentity = vi.fn();
const createClient = vi.fn();
const getMascotGenerationProvider = vi.fn();
const providerGetJob = vi.fn();

vi.mock("@/lib/auth/browser-auth", () => ({
  authErrorResponse: vi.fn(() => undefined),
  requireBrowserIdentity,
}));
vi.mock("@/lib/mascot-generation/provider", () => ({ getMascotGenerationProvider }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const OWNER_ID = "owner-123";
const OTHER_OWNER_ID = "other-owner-456";
const ATTEMPT_ID = "attempt-1234567890123456";
const JOB_ID = "job-123";
const HATCHED_AT = "2026-09-07T12:00:00.000Z";

type FakeDatabase = {
  attempt: MascotAttempt | null;
  updateCalls: Array<Record<string, unknown>>;
  updatedHatchedAt: string;
};

function createFakeDatabase(attempt: MascotAttempt | null = createAttempt()) {
  return {
    attempt,
    updateCalls: [],
    updatedHatchedAt: HATCHED_AT,
  } satisfies FakeDatabase;
}

function createFakeSupabase(database: FakeDatabase) {
  return {
    from(table: string) {
      if (table !== "mascot_attempts") throw new Error(`Unexpected table: ${table}`);

      const filters: Record<string, unknown> = {};
      let isUpdate = false;
      const builder = {
        select() {
          return builder;
        },
        update(values: Record<string, unknown>) {
          isUpdate = true;
          database.updateCalls.push(values);
          return builder;
        },
        eq(field: string, value: unknown) {
          filters[field] = value;
          return builder;
        },
        not(field: string, operator: string, value: unknown) {
          if (operator !== "is") throw new Error(`Unexpected operator: ${operator}`);
          filters[`not:${field}`] = value;
          return builder;
        },
        async maybeSingle() {
          if (!matchesAttempt(database.attempt, filters)) return { data: null, error: null };
          if (isUpdate) {
            return { data: { id: database.attempt?.id, hatched_at: database.updatedHatchedAt }, error: null };
          }
          return { data: database.attempt, error: null };
        },
      };

      return builder;
    },
  };
}

function matchesAttempt(attempt: MascotAttempt | null, filters: Record<string, unknown>) {
  if (!attempt) return false;
  for (const [field, value] of Object.entries(filters)) {
    if (field.startsWith("not:")) {
      const actual = attempt[field.slice(4) as keyof MascotAttempt];
      if (value === null && actual === null) return false;
      continue;
    }
    if (attempt[field as keyof MascotAttempt] !== value) return false;
  }
  return true;
}

function createAttempt(overrides: Partial<MascotAttempt> = {}): MascotAttempt {
  return {
    id: "row-123",
    user_id: OWNER_ID,
    attempt_id: ATTEMPT_ID,
    modal_job_id: JOB_ID,
    status: "awaiting_set_approval",
    selected_master_id: "master-123",
    workflow_mode: "async_incubator_v1",
    generation_ready_at: "2026-09-07T11:00:00.000Z",
    hatched_at: null,
    created_at: "2026-09-07T10:00:00.000Z",
    updated_at: "2026-09-07T11:00:00.000Z",
    ...overrides,
  };
}

function createPose(role: PoseRole, index: number): GeneratedPose {
  return {
    id: `pose-${index}`,
    role,
    optionId: `${role}-option`,
    label: role,
    imageUrl: `/assets/${role}.png`,
  };
}

function createJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  const poseChoices = { normal: "normal-option", listening: "listening-option", transcribing: "transcribing-option" };
  return {
    id: JOB_ID,
    attemptId: ATTEMPT_ID,
    status: "awaiting_set_approval",
    message: "As três poses estão prontas para revisão.",
    generationScheduled: true,
    masters: [],
    subjectIdentity: { category: "animal", label: "arara", species: "arara", confirmed: true },
    poseChoices,
    configuration: { displayName: "Mascote GRU", poseChoices, configurationRevision: 1 },
    poses: [createPose("normal", 1), createPose("listening", 2), createPose("transcribing", 3)],
    poseSetQc: { status: "passed", code: "POSE_SET_QC_PASSED", version: "pose-set-visual-v3", safe_reasons: [] },
    workflowMode: "async_incubator_v1",
    productState: "READY_TO_HATCH",
    generationReadyAt: "2026-09-07T11:00:00.000Z",
    ...overrides,
  };
}

function hatchRequest() {
  return new Request(`https://puleiro.test/api/mascot/incubations/${JOB_ID}/hatch`, {
    method: "POST",
    headers: {
      origin: "https://puleiro.test",
      "content-type": "application/json",
    },
  });
}

async function postHatch() {
  const { POST } = await import("@/app/api/mascot/incubations/[jobId]/hatch/route");
  return POST(hatchRequest(), { params: Promise.resolve({ jobId: JOB_ID }) });
}

describe("POST /api/mascot/incubations/[jobId]/hatch", () => {
  let database: FakeDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    database = createFakeDatabase();
    requireBrowserIdentity.mockResolvedValue({ uid: OWNER_ID, mode: "supabase-session" });
    createClient.mockResolvedValue(createFakeSupabase(database));
    getMascotGenerationProvider.mockReturnValue({ getJob: providerGetJob });
    providerGetJob.mockResolvedValue(createJob());
  });

  it("choca um READY_TO_HATCH com as três roles e QC visual v3 aprovado", async () => {
    const response = await postHatch();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: { id: JOB_ID, productState: "HATCHED", hatchedAt: HATCHED_AT },
    });
    expect(database.updateCalls).toHaveLength(1);
    expect(database.updateCalls[0]).toMatchObject({ hatched_at: expect.any(String) });
    expect(providerGetJob).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ ownerId: OWNER_ID, attemptId: ATTEMPT_ID }));
  });

  const invalidJobOverrides: Array<[string, Partial<GenerationJob>]> = [
    ["roles duplicadas", { poses: [createPose("normal", 1), createPose("normal", 2), createPose("transcribing", 3)] }],
    ["role ausente", { poses: [createPose("normal", 1), createPose("listening", 2)] }],
    ["QC v2", { poseSetQc: { status: "passed", code: "POSE_SET_QC_PASSED", version: "pose-set-visual-v2", safe_reasons: [] } }],
    ["versão do QC ausente", { poseSetQc: { status: "passed", code: "POSE_SET_QC_PASSED", safe_reasons: [] } as never }],
    ["estado INCUBATING", { productState: "INCUBATING" }],
    ["status incorreto", { status: "generating_poses" }],
  ];

  it.each(invalidJobOverrides)("rejeita %s", async (_caseName, overrides) => {
    providerGetJob.mockResolvedValueOnce(createJob(overrides));

    const response = await postHatch();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "GENERATION_NOT_READY" });
    expect(database.updateCalls).toHaveLength(0);
  });

  it("rejeita um job que não pertence ao owner autenticado", async () => {
    requireBrowserIdentity.mockResolvedValueOnce({ uid: OTHER_OWNER_ID, mode: "supabase-session" });

    const response = await postHatch();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "JOB_NOT_FOUND" });
    expect(providerGetJob).not.toHaveBeenCalled();
  });

  it("faz replay idempotente quando o hatch já foi persistido", async () => {
    database.attempt = createAttempt({ hatched_at: HATCHED_AT });

    const response = await postHatch();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ job: { productState: "HATCHED", hatchedAt: HATCHED_AT } });
    expect(database.updateCalls).toHaveLength(0);
  });
});
