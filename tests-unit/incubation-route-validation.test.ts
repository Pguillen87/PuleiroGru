import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTrustedMutationRequest = vi.fn();
const requireBrowserIdentity = vi.fn();

vi.mock("@/lib/security/mutation-request", () => ({ requireTrustedMutationRequest }));
vi.mock("@/lib/auth/browser-auth", () => ({
  authErrorResponse: vi.fn(() => null),
  requireBrowserIdentity,
}));
vi.mock("@/lib/mascot-generation/config", () => ({
  generationConfig: { incubatorFlowEnabled: true, maxUploadBytes: 1024, maxImageDimension: 256 },
}));

const ownerId = "8e558341-61cf-4a4a-9773-35f20f4c194e";

function requestWith(fields: Record<string, string>) {
  const form = new FormData();
  form.set("photo", new File(["photo"], "source.png", { type: "image/png" }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("https://puleiro.test/api/mascot/incubations", {
    method: "POST",
    headers: { "x-puleiro-incubation-key": "8e558341-61cf-4a4a-9773-35f20f4c194e" },
    body: form,
  });
}

describe("POST /api/mascot/incubations input validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: ownerId, mode: "supabase-session" });
  });

  it.each([
    ["subject inválido", { subjectCategory: "invalid", subjectLabel: "foto", poseChoices: "{}" }, "SUBJECT_IDENTITY_INVALID"],
    ["poses inválidas", { subjectCategory: "animal", subjectLabel: "arara", subjectSpecies: "arara", poseChoices: "{bad" }, "POSE_CHOICES_INVALID"],
    ["hint inválido", { subjectCategory: "animal", subjectLabel: "arara", subjectSpecies: "arara", poseChoices: "{}", subjectHint: "{bad" }, "SUBJECT_HINT_INVALID"],
  ])("devolve 400 para %s", async (_name, fields, code) => {
    const { POST } = await import("@/app/api/mascot/incubations/route");
    const response = await POST(requestWith(fields));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it("mantém confirmação de mismatch como 409", async () => {
    const { POST } = await import("@/app/api/mascot/incubations/route");
    const response = await POST(requestWith({
      subjectCategory: "animal", subjectLabel: "arara", subjectSpecies: "arara", poseChoices: "{}",
      subjectHint: JSON.stringify({ version: "subject-hint-v1", suggestedCategory: "human", confidenceBand: "high", requiresConfirmation: true, overrideConfirmed: false }),
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "SUBJECT_MISMATCH_CONFIRMATION_REQUIRED" });
  });
});
