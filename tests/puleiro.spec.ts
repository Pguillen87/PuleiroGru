import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const sourcePhoto = readFileSync(path.join(process.cwd(), "public/assets/puleiro-entry.jpg"));

async function selectPhoto(page: import("@playwright/test").Page, mimeType = "image/jpeg") {
  const buffer = mimeType === "image/jpeg"
    ? sourcePhoto
    : await sharp(sourcePhoto)[mimeType === "image/png" ? "png" : "webp"]().toBuffer();
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.locator("#pet-photo").setInputFiles({ name: `pet.${mimeType.split("/")[1]}`, mimeType, buffer });
}

async function completeFlow(page: import("@playwright/test").Page) {
  await selectPhoto(page);
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await expect(page.getByRole("heading", { name: "Seu mascote chegou!" })).toBeVisible({ timeout: 5_000 });
}

test("percorre o fluxo explícito sem ações prematuras", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Puleiro do GRU" })).toBeVisible();
  await selectPhoto(page);
  await expect(page.getByRole("heading", { name: "Esta é a foto certa?" })).toBeVisible();
  await expect(page.getByText("Nada foi enviado ainda")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gostei deste" })).toHaveCount(0);
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await expect(page.getByRole("heading", { name: /Enviando sua foto|Abrindo o ovo|Preparando o nascimento/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gostei deste" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Seu mascote chegou!" })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Gostei deste" }).click();
  await expect(page.getByRole("heading", { name: "Este é o seu mascote mestre" })).toBeVisible();
  await expect(page.getByText("Aprovado nesta sessão")).toBeVisible();
});

for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
  test(`aceita e mostra prévia de ${mimeType}`, async ({ page }) => {
    await page.goto("/");
    await selectPhoto(page, mimeType);
    await expect(page.locator(".stage__art img")).toHaveAttribute("src", /^blob:/);
    await expect(page.getByRole("button", { name: "Usar esta foto" })).toBeVisible();
  });
}

test("rejeita tipo inválido e arquivo acima do limite", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.locator("#pet-photo").setInputFiles({ name: "pet.txt", mimeType: "text/plain", buffer: Buffer.from("não é imagem") });
  await expect(page.getByRole("alert")).toContainText("JPEG, PNG ou WebP");
  await page.locator("#pet-photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert")).toContainText("até 10 MB");
});

test("permite remover e substituir antes do envio", async ({ page }) => {
  await page.goto("/");
  await selectPhoto(page);
  await page.getByRole("button", { name: "Remover foto" }).click();
  await expect(page.getByRole("heading", { name: "Quem vai nascer no Puleiro?" })).toBeVisible();
  await page.locator("#pet-photo").setInputFiles({ name: "outro.jpg", mimeType: "image/jpeg", buffer: sourcePhoto });
  await page.getByRole("button", { name: "Trocar foto" }).click();
  await expect(page.getByRole("button", { name: "Escolher foto" })).toBeVisible();
});

test("API cria job, informa processamento e conclui", async ({ request }) => {
  const created = await request.post("/api/mascot/jobs", {
    multipart: { photo: { name: "pet.jpg", mimeType: "image/jpeg", buffer: sourcePhoto } },
  });
  expect(created.status()).toBe(202);
  const id = (await created.json()).job.id as string;
  const processing = await request.get(`/api/mascot/jobs/${id}`);
  expect(["processing", "succeeded"]).toContain((await processing.json()).job.status);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const finished = await request.get(`/api/mascot/jobs/${id}`);
  expect((await finished.json()).job.status).toBe("succeeded");
});

test("API rejeita job inexistente e conteúdo incompatível com o MIME", async ({ request }) => {
  expect((await request.get("/api/mascot/jobs/inexistente")).status()).toBe(404);
  const invalid = await request.post("/api/mascot/jobs", {
    multipart: { photo: { name: "falso.jpg", mimeType: "image/jpeg", buffer: Buffer.from("falso") } },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).code).toBe("INVALID_IMAGE");
});

test("falha do job preserva foto e oferece retry", async ({ page }) => {
  await page.route("**/api/mascot/jobs", (route) => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ job: { id: "falha", status: "queued", message: "Preparando…" } }),
  }));
  await page.route("**/api/mascot/jobs/falha", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ job: { id: "falha", status: "failed", message: "O ovo não abriu.", retryable: true } }),
  }));
  await page.goto("/");
  await selectPhoto(page);
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await expect(page.getByRole("heading", { name: "Este nascimento precisa de outra tentativa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trocar foto" })).toBeVisible();
});

test("timeout encerra polling e uma nova tentativa cria outro job", async ({ page }) => {
  let creations = 0;
  await page.route("**/api/mascot/jobs", (route) => {
    creations += 1;
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job: { id: `lento-${creations}`, status: "queued", message: "Preparando…" } }),
    });
  });
  await page.route("**/api/mascot/jobs/lento-*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ job: { id: "lento", status: "processing", message: "Criando…" } }),
  }));
  await page.goto("/");
  await selectPhoto(page);
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await expect(page.getByRole("heading", { name: "Este nascimento precisa de outra tentativa" })).toBeVisible({ timeout: 4_000 });
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect.poll(() => creations).toBe(2);
});

test("ver outra opção exige confirmação antes de novo job", async ({ page }) => {
  await page.goto("/");
  await completeFlow(page);
  await page.getByRole("button", { name: "Ver outra opção" }).click();
  await expect(page.getByRole("heading", { name: "Quer abrir outro ovo?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar outra opção" })).toBeVisible();
});

test("movimento reduzido preserva conteúdo e remove loops", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await completeFlow(page);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await expect(page.locator(".curtain")).toHaveCount(0);
  await context.close();
});

test("teclado, nomes acessíveis e contraste básico", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const button = page.getByRole("button", { name: "Criar meu mascote" });
  await button.focus();
  expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Escolher foto" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("touch targets mantêm pelo menos 48 px na prévia móvel", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await selectPhoto(page);
  for (const control of await page.locator("button:visible, a:visible").all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});

for (const orientation of ["vertical", "horizontal"] as const) {
  test(`prévia ${orientation} permanece contida no palco`, async ({ page }) => {
    const dimensions = orientation === "vertical" ? { width: 600, height: 900 } : { width: 900, height: 600 };
    const buffer = await sharp({
      create: { ...dimensions, channels: 3, background: { r: 116, g: 131, b: 70 } },
    }).jpeg().toBuffer();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Criar meu mascote" }).click();
    await page.locator("#pet-photo").setInputFiles({ name: `${orientation}.jpg`, mimeType: "image/jpeg", buffer });
    const art = await page.locator(".stage__art").boundingBox();
    const image = await page.locator(".stage__art img").boundingBox();
    expect(image).toEqual(art);
  });
}

for (const width of [360, 390, 430, 768, 1024, 1440]) {
  test(`reflow sem rolagem horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Criar meu mascote" }).click();
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  });
}

test("zoom de 200% mantém uma única composição responsiva", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  const stage = page.locator("#puleiro-stage");
  const note = page.locator(".editorial-note");
  expect((await note.boundingBox())?.y).toBeGreaterThan((await stage.boundingBox())?.y ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
