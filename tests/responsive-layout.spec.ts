import { expect, test, type Page } from "@playwright/test";

const incubation = {
  attemptId: "responsive-incubation",
  jobId: "responsive-job",
  productState: "INCUBATING",
  phase: "generating_masters",
  createdAt: "2026-09-13T14:46:00Z",
  updatedAt: "2026-09-13T14:48:00Z",
  poseCount: 0,
};

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test("Home mantém palco e caminhos alinhados no celular", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Todo mascote começa por aqui." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Incubadora" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Criar continua rolável no desktop sem recortar o palco", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/criar");

  await expect(page.locator(".stage")).toBeVisible();
  await expect(page.locator(".stage__content")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Incubadora usa filtros acessíveis e não estica um único card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/mascot/incubations", (route) => route.fulfill({ json: { incubations: [incubation] } }));
  await page.route("**/api/mascot/incubations/timing", (route) => route.fulfill({ json: { averageMs: null, sampleCount: 0 } }));
  await page.goto("/incubadora");

  await expect(page.locator(".incubator-list__controls .library-filter")).toBeVisible();
  await expect(page.locator(".incubator-list__controls .library-filter button")).toHaveCount(5);
  await expect(page.locator(".incubator-egg")).toHaveCSS("min-width", "0px");

  const cardWidth = await page.locator(".incubator-egg").evaluate((element) => element.getBoundingClientRect().width);
  expect(cardWidth).toBeLessThan(700);
  await expectNoHorizontalOverflow(page);
});
