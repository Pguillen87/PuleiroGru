import { expect, test } from "@playwright/test";

const libraryItem = {
  id: "item-post-birth",
  displayName: "Pipoca",
  mascotCode: "GRU-AAAA-BBBB",
  jobId: "job-post-birth",
  attemptId: "attempt-post-birth",
  masterId: "master-1",
  poses: [
    { id: "pose-normal", role: "normal", optionId: "normal-1", label: "Normal", imageUrl: "/api/mascot/library/item-post-birth/pose/normal" },
    { id: "pose-listening", role: "listening", optionId: "listening-1", label: "Ouvindo", imageUrl: "/api/mascot/library/item-post-birth/pose/listening" },
    { id: "pose-transcribing", role: "transcribing", optionId: "transcribing-1", label: "Transcrevendo", imageUrl: "/api/mascot/library/item-post-birth/pose/transcribing" },
  ],
  createdAt: "2026-09-07T12:05:00.000Z",
  isFavorite: false,
  finalization: { state: "ready" },
};

test("mostra o mascote concluído e retoma a biblioteca depois do refresh", async ({ page }) => {
  let libraryRequests = 0;
  let savedCommunityRequests = 0;
  await page.route("**/api/mascot/library?**", async (route) => {
    libraryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [libraryItem], total: 1, nextOffset: null }),
    });
  });
  await page.route("**/api/mascot/community/saved", (route) => {
    savedCommunityRequests += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
  });

  await page.goto("/meus-mascotes");
  await expect(page.getByText("Pipoca", { exact: true })).toBeVisible();
  await expect(page.getByText("GRU-AAAA-BBBB")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ovos e nascimentos em andamento" })).toHaveCount(0);
  expect(savedCommunityRequests).toBe(0);

  await page.reload();
  await expect(page.getByText("Pipoca", { exact: true })).toBeVisible();
  expect(libraryRequests).toBe(2);
});

test("mostra erro seguro quando a leitura owner-scoped falha", async ({ page }) => {
  let savedCommunityRequests = 0;
  await page.route("**/api/mascot/library?**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ code: "LIBRARY_READ_FAILED", message: "Não foi possível abrir sua biblioteca agora." }),
  }));
  await page.route("**/api/mascot/community/saved", (route) => {
    savedCommunityRequests += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
  });

  await page.goto("/meus-mascotes");
  await expect(page.getByRole("status")).toContainText("Não foi possível abrir sua biblioteca agora.");
  await expect(page.getByRole("heading", { name: "Mascotes pós-nascimento ativos" })).toHaveCount(0);
  expect(savedCommunityRequests).toBe(0);
});
