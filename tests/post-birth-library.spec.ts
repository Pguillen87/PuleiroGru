import { expect, test } from "@playwright/test";

const profile = {
  id: "profile-post-birth",
  attemptId: "attempt-post-birth",
  modalJobId: "job-post-birth",
  state: "ACTIVE",
  displayName: "Pipoca",
  journalConfig: { version: 1 },
  configurationRevision: 5,
  updatedAt: "2026-09-07T12:05:00.000Z",
  activatedAt: "2026-09-07T12:05:00.000Z",
};

test("mostra o nome e estado ativo e retoma o mascote depois do refresh", async ({ page }) => {
  let libraryRequests = 0;
  await page.route("**/api/mascot/library?**", async (route) => {
    libraryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [], pendingItems: [], total: 0, nextOffset: null, postBirthProfiles: [profile] }),
    });
  });
  await page.route("**/api/mascot/incubations", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ incubations: [{ jobId: "job-post-birth", attemptId: "attempt-post-birth", productState: "HATCHED", phase: "awaiting_set_approval", updatedAt: "2026-09-07T12:05:00.000Z", poseCount: 3 }] }) }));
  await page.route("**/api/mascot/community/saved", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) }));

  await page.goto("/meus-mascotes");
  const shelf = page.getByRole("region", { name: "Mascotes pós-nascimento ativos" });
  await expect(shelf.getByRole("heading", { name: "Pipoca" })).toBeVisible();
  await expect(shelf.getByText("Ativo", { exact: true })).toBeVisible();
  await expect(shelf.getByRole("link", { name: "Abrir Jornal" })).toHaveAttribute("href", "/incubadora/job-post-birth");
  await expect(page.getByRole("heading", { name: "Ovos e nascimentos em andamento" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("region", { name: "Mascotes pós-nascimento ativos" }).getByRole("heading", { name: "Pipoca" })).toBeVisible();
  expect(libraryRequests).toBe(2);
});

test("mostra erro seguro quando a leitura owner-scoped falha", async ({ page }) => {
  await page.route("**/api/mascot/library?**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ code: "LIBRARY_READ_FAILED", message: "Não foi possível abrir sua biblioteca agora." }),
  }));
  await page.route("**/api/mascot/incubations", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ incubations: [] }) }));
  await page.route("**/api/mascot/community/saved", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) }));

  await page.goto("/meus-mascotes");
  await expect(page.getByRole("status")).toContainText("Não foi possível abrir sua biblioteca agora.");
  await expect(page.getByRole("region", { name: "Mascotes pós-nascimento ativos" })).toHaveCount(0);
});
