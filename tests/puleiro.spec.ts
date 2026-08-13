import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("percorre entrada, preparação e reveal sem ações prematuras", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Puleiro do GRU" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar meu mascote" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gostei deste" })).toHaveCount(0);

  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await expect(page.getByRole("heading", { name: "Preparando o nascimento" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gostei deste" })).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "O nascimento começou" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Gostei deste" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Seu mascote chegou!" })).toBeVisible({ timeout: 6_000 });
  await expect(page.getByRole("button", { name: "Gostei deste" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver outra opção" })).toBeVisible();
  await page.getByRole("button", { name: "Gostei deste" }).click();
  await expect(page.getByRole("status", { name: "" }).filter({ hasText: "Mascote escolhido" })).toBeVisible();
});

test("ver outra opção retorna à preparação", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.getByRole("button", { name: "Ver outra opção" }).waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: "Ver outra opção" }).click();
  await expect(page.getByRole("heading", { name: "Preparando o nascimento" })).toBeVisible();
});

test("movimento reduzido preserva conteúdo e remove animações", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await expect(page.getByRole("heading", { name: "Seu mascote chegou!" })).toBeVisible({ timeout: 5_000 });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await expect(page.locator(".curtain")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gostei deste" })).toBeVisible();
  await context.close();
});

test("ação principal funciona por teclado e exibe foco", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Criar meu mascote" });
  await button.focus();
  expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Preparando o nascimento" })).toBeVisible();
});

test("estrutura, contraste e nomes acessíveis não têm violações críticas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const entryResults = await new AxeBuilder({ page }).analyze();
  expect(entryResults.violations).toEqual([]);
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.getByRole("heading", { name: "Seu mascote chegou!" }).waitFor({ timeout: 6_000 });
  const revealResults = await new AxeBuilder({ page }).analyze();
  expect(revealResults.violations).toEqual([]);
});

test("controles visíveis mantêm área mínima e console limpo", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  for (const control of await page.locator(".site-shell a:visible, .site-shell button:visible").all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
  await page.getByRole("button", { name: "Fechar menu" }).click();
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.getByRole("heading", { name: "Seu mascote chegou!" }).waitFor({ timeout: 6_000 });
  expect(consoleErrors).toEqual([]);
});

for (const width of [360, 390, 430, 768, 1024, 1440]) {
  test(`reflow sem rolagem horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  });
}

test("reflow equivalente a zoom de 200% retorna à composição em coluna", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  const layout = page.locator(".experience-layout");
  const stage = page.locator("#puleiro-stage");
  const note = page.locator(".editorial-note");
  await expect(stage).toBeVisible();
  expect((await note.boundingBox())?.y).toBeGreaterThan((await stage.boundingBox())?.y ?? 0);
  const dimensions = await layout.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});
