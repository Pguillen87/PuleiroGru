import { expect, test } from "@playwright/test";

const jobId = "job-ambiguous";

function ambiguousJob() {
  return {
    id: jobId,
    attemptId: "attempt-ambiguous",
    status: "awaiting_master_approval",
    message: "Escolha o mascote que mais parece com o seu.",
    generationScheduled: false,
    workflowMode: "async_incubator_v1",
    productState: "NEEDS_HUMAN_MASTER_SELECTION",
    subjectIdentity: { category: "animal", label: "animal", confirmed: true },
    poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" },
    configuration: { displayName: "", poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" }, configurationRevision: 1 },
    masters: ["master_1", "master_2", "master_3"].map((id) => ({ id, imageUrl: "/assets/puleiro-reveal.jpg" })),
    poses: [],
    masterSelection: { rankerVersion: "master-ranker-v2", decision: "NEEDS_HUMAN_SELECTION", decisionReason: "RANKING_AMBIGUOUS", scores: [] },
  };
}

test("a escolha humana exige confirmação explícita, preserva seleção em erro e não exibe score", async ({ page }, testInfo) => {
  let selectionRequests = 0;
  let returnFailure = true;
  await page.route("**/api/mascot/incubations", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ incubations: [{ jobId, attemptId: "attempt-ambiguous", productState: "NEEDS_HUMAN_MASTER_SELECTION", phase: "awaiting_master_approval", updatedAt: "2026-08-30T21:00:00.000Z", poseCount: 0 }] }),
  }));
  await page.route("**/api/mascot/library?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], pendingItems: [], total: 0, nextOffset: null }) }));
  await page.route("**/api/mascot/community/saved", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.route(`**/api/mascot/incubations/${jobId}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ job: ambiguousJob() }) }));
  await page.route(`**/api/mascot/incubations/${jobId}/masters/master_2/select`, async (route) => {
    selectionRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (returnFailure) {
      returnFailure = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "MASTER_SELECTION_UNAVAILABLE", message: "Tente novamente." }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ job: { ...ambiguousJob(), productState: "INCUBATING", status: "generating_poses" } }) });
  });

  await page.goto("/meus-mascotes");
  await expect(page.getByRole("heading", { name: "Ovos e nascimentos em andamento" })).toBeVisible();
  await expect(page.getByText("Precisa de você")).toBeVisible();
  await expect(page.getByRole("link", { name: "Escolher mascote" })).toHaveAttribute("href", `/incubadora/${jobId}`);
  await page.screenshot({ path: testInfo.outputPath("incubator-needs-human-card.png"), fullPage: true });

  await page.goto(`/incubadora/${jobId}`);
  await expect(page.getByRole("heading", { name: "Escolha o mascote que mais parece com o seu." })).toBeVisible();
  const choices = page.getByRole("button", { name: "Selecionar esta opção" });
  await expect(choices).toHaveCount(3);
  const confirm = page.getByRole("button", { name: "Confirmar escolha" });
  await expect(confirm).toBeDisabled();
  await choices.nth(1).focus();
  await page.keyboard.press("Space");
  await expect(choices.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(confirm).toBeEnabled();
  expect(selectionRequests).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("incubation-master-selection-desktop.png"), fullPage: true });
  await confirm.click();
  await expect(page.locator(".stage-error[role=alert]")).toContainText("Tente novamente.");
  await expect(choices.nth(1)).toHaveAttribute("aria-pressed", "true");
  expect(selectionRequests).toBe(1);
  await confirm.evaluate((button) => { (button as HTMLElement).click(); (button as HTMLElement).click(); });
  await expect(page.getByText("Encontramos mais de uma opção boa.")).toHaveCount(0);
  expect(selectionRequests).toBe(2);
  await expect(page.getByText(/\b0\.\d+/)).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/incubadora/${jobId}`);
  await expect(choices).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("incubation-master-selection-mobile.png"), fullPage: true });
});
