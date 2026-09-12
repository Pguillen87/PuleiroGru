import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const sourcePhoto = readFileSync(path.join(process.cwd(), "public/assets/puleiro-entry.jpg"));

test("/criar usa a jornada assíncrona e encaminha uma única criação para a Incubadora", async ({ page }) => {
  let registrationRequests = 0;
  await page.route("**/api/mascot/capabilities", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ capabilities: {
      contractVersion: "v2",
      master: { ready: false, modelVersion: "mock-v1", promptVersion: "mock-v1", reasons: ["TEST_ONLY"] },
      poses: { ready: false, workerVersion: "mock-v1", catalogVersion: "pose-catalog-v1", templateVersion: "pose-catalog-v1", reasons: ["TEST_ONLY"] },
      poseCatalog: { normal: ["normal_attentive"], listening: ["listening_focus"], transcribing: ["transcribing_fast"] },
      incubator: { ready: true, enabled: true, workflowVersion: "async_incubator_v1", rankerVersion: "mock-ranker-v1", subjectHintVersion: "subject-hint-v1", encoder: { ready: true, reasonCode: null, version: "mock-v1" } },
    } }),
  }));
  await page.route("**/api/mascot/subject-hint", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ hint: { version: "subject-hint-v1", suggestedCategory: "human", confidenceBand: "high", requiresConfirmation: false, overrideConfirmed: false } }),
  }));
  await page.route("**/api/mascot/incubations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    registrationRequests += 1;
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job: {
        id: "job-async-creation",
        attemptId: "attempt-async-creation",
        status: "queued",
        message: "Ovo registrado.",
        generationScheduled: true,
        workflowMode: "async_incubator_v1",
        productState: "PREPARING",
        subjectIdentity: { category: "human", label: "pessoa", confirmed: true },
        poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" },
        configuration: { displayName: "Mascote GRU", poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" }, configurationRevision: 0 },
        masters: [],
        poses: [],
      } }),
    });
  });

  await page.goto("/criar");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.locator("#pet-photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: sourcePhoto });
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await page.getByRole("radio", { name: /Pessoa/ }).check();
  await page.getByRole("button", { name: "Confirmar e escolher poses" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Revise o ovo antes da Incubadora" })).toBeVisible();
  await page.getByRole("button", { name: "Colocar na Incubadora" }).click();
  await expect(page.getByRole("heading", { name: "A Incubadora cuidará do resto." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir Incubadora" })).toHaveAttribute("href", "/incubadora");
  expect(registrationRequests).toBe(1);
});
