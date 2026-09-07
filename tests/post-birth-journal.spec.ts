import { expect, test, type Page } from "@playwright/test";

const jobId = "job-post-birth";

function hatchedJob() {
  return {
    id: jobId,
    attemptId: "attempt-post-birth",
    status: "ready" as const,
    message: "Nascimento confirmado.",
    generationScheduled: false,
    workflowMode: "async_incubator_v1" as const,
    productState: "HATCHED" as const,
    hatchedAt: "2026-09-07T12:00:00.000Z",
    subjectIdentity: { category: "animal" as const, label: "animal", confirmed: true as const },
    poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" },
    configuration: {
      displayName: "",
      poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" },
      configurationRevision: 1,
    },
    masters: [{ id: "master_1", imageUrl: "/assets/puleiro-reveal.jpg" }],
    approvedMasterId: "master_1",
    poses: [
      { id: "pose-normal", role: "normal" as const, optionId: "normal_attentive", label: "Atento", imageUrl: "/assets/puleiro-reveal.jpg" },
      { id: "pose-listening", role: "listening" as const, optionId: "listening_focus", label: "Ouvindo", imageUrl: "/assets/puleiro-reveal.jpg" },
      { id: "pose-transcribing", role: "transcribing" as const, optionId: "transcribing_fast", label: "Anotando", imageUrl: "/assets/puleiro-reveal.jpg" },
    ],
    poseSetQc: { status: "passed" as const, code: "POSE_SET_VISUAL_QC_PASSED", version: "pose-set-visual-v3", safe_reasons: [] },
  };
}

function draftProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-post-birth",
    userId: "dev-user",
    attemptId: "attempt-post-birth",
    modalJobId: jobId,
    state: "DRAFT",
    displayName: null,
    journalConfig: { version: 1 },
    configurationRevision: 4,
    createdAt: "2026-09-07T12:00:00.000Z",
    updatedAt: "2026-09-07T12:00:00.000Z",
    activatedAt: null,
    ...overrides,
  };
}

async function mockHatchedJob(page: Page) {
  await page.route(`**/api/mascot/incubations/${jobId}`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ job: hatchedJob() }),
  }));
}

test("carrega, salva o nome e ativa o perfil pós-nascimento", async ({ page }) => {
  let profile = draftProfile();
  let patchBody: Record<string, unknown> | undefined;
  let activationBody: Record<string, unknown> | undefined;
  let idempotencyKey = "";

  await mockHatchedJob(page);
  await page.route(`**/api/mascot/incubations/${jobId}/profile`, async (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      profile = draftProfile({ displayName: "Pipoca", configurationRevision: 5 });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ profile }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ profile }) });
  });
  await page.route(`**/api/mascot/incubations/${jobId}/activate`, async (route) => {
    activationBody = route.request().postDataJSON() as Record<string, unknown>;
    idempotencyKey = await route.request().headerValue("Idempotency-Key") ?? "";
    profile = draftProfile({ state: "ACTIVE", displayName: "Pipoca", configurationRevision: 5, activatedAt: "2026-09-07T12:05:00.000Z" });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ profile, idempotentReplay: false }) });
  });

  await page.goto(`/incubadora/${jobId}`);
  await expect(page.getByRole("heading", { name: "Seu mascote saiu do ovo." })).toBeVisible();
  const postBirth = page.locator(".post-birth-journal");
  await expect(postBirth.getByRole("heading", { name: "Agora dê um nome ao seu mascote." })).toBeVisible();

  const nameInput = postBirth.getByLabel("Nome do mascote");
  await expect(nameInput).toHaveValue("");
  await nameInput.fill("Pipoca");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(postBirth.locator(".post-birth-journal__feedback")).toContainText("Nome salvo");
  expect(patchBody).toEqual({ configurationRevision: 4, display_name: "Pipoca", journal_config: { version: 1 } });

  await page.getByRole("button", { name: "Ativar mascote" }).click();
  await expect(postBirth.locator(".post-birth-journal__feedback")).toContainText("Mascote ativo");
  expect(activationBody).toEqual({ configurationRevision: 5 });
  expect(idempotencyKey).toMatch(/^post-birth-profile-/);
  await expect(nameInput).toBeDisabled();
  await expect(page.getByRole("button", { name: "Salvar nome" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ativar mascote" })).toHaveCount(0);
  await expect(page.getByText(/Android|Library|pacote/i)).toHaveCount(0);
});

test("preserva o rascunho local e informa conflito de revisão", async ({ page }) => {
  await mockHatchedJob(page);
  await page.route(`**/api/mascot/incubations/${jobId}/profile`, async (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "POST_BIRTH_PROFILE_CONFLICT", message: "Este perfil mudou em outra aba." }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ profile: draftProfile() }) });
  });
  await page.goto(`/incubadora/${jobId}`);
  const postBirth = page.locator(".post-birth-journal");
  const nameInput = postBirth.getByLabel("Nome do mascote");
  await nameInput.fill("Jabuticaba");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(postBirth.getByRole("alert")).toContainText("Este perfil mudou em outra aba");
  await expect(nameInput).toHaveValue("Jabuticaba");
});

test("mantém um perfil ACTIVE somente para leitura", async ({ page }) => {
  await mockHatchedJob(page);
  await page.route(`**/api/mascot/incubations/${jobId}/profile`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ profile: draftProfile({ state: "ACTIVE", displayName: "Pipoca", configurationRevision: 6, activatedAt: "2026-09-07T12:05:00.000Z" }) }),
  }));
  await page.goto(`/incubadora/${jobId}`);
  const postBirth = page.locator(".post-birth-journal");
  await expect(postBirth.locator(".post-birth-journal__feedback")).toContainText("Mascote ativo");
  await expect(postBirth.getByLabel("Nome do mascote")).toHaveValue("Pipoca");
  await expect(postBirth.getByLabel("Nome do mascote")).toBeDisabled();
  await expect(postBirth.getByRole("button", { name: "Salvar nome" })).toHaveCount(0);
  await expect(postBirth.getByRole("button", { name: "Ativar mascote" })).toHaveCount(0);
});

test("informa quando o perfil pós-nascimento ainda não está disponível", async ({ page }) => {
  await mockHatchedJob(page);
  await page.route(`**/api/mascot/incubations/${jobId}/profile`, (route) => route.fulfill({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({ code: "POST_BIRTH_PROFILE_NOT_FOUND", message: "Perfil pós-nascimento não encontrado." }),
  }));
  await page.goto(`/incubadora/${jobId}`);
  const postBirth = page.locator(".post-birth-journal");
  await expect(postBirth.getByRole("alert")).toContainText("perfil pós-nascimento ainda não está disponível");
  await expect(postBirth.getByLabel("Nome do mascote")).toHaveCount(0);
});
