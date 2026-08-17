import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const sourcePhoto = readFileSync(path.join(process.cwd(), "public/assets/puleiro-entry.jpg"));
const humanIdentity = { subjectCategory: "human", subjectLabel: "pessoa" };
const jobIdentity = { subjectIdentity: { category: "human", label: "pessoa", confirmed: true }, poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" } };

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
  await page.getByRole("radio", { name: /Pessoa/ }).check();
  await page.getByRole("button", { name: "Confirmar e começar" }).click();
  await expect(page.getByRole("heading", { name: "Seu mascote chegou!" })).toBeVisible({ timeout: 5_000 });
}

test("duplo envio e refresh retomam o mesmo job sem novo registro", async ({ request }) => {
  const upload = () => request.post("/api/mascot/jobs", {
    multipart: { photo: { name: "foto.jpg", mimeType: "image/jpeg", buffer: sourcePhoto }, ...humanIdentity },
  });
  const first = await upload();
  const second = await upload();
  expect(first.ok()).toBeTruthy();
  expect(second.ok()).toBeTruthy();
  const firstJob = (await first.json()).job;
  const secondJob = (await second.json()).job;
  expect(secondJob.id).toBe(firstJob.id);
  const resumed = await request.get("/api/mascot/jobs/current");
  expect((await resumed.json()).job.id).toBe(firstJob.id);
});

test("a Central do Puleiro encaminha para os três caminhos principais", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Todo mascote começa por aqui." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Criar meu mascote" })).toHaveAttribute("href", "/criar");
  await expect(page.getByRole("link", { name: /Explorar comunidade/ })).toHaveAttribute("href", "/explorar");
  await expect(page.getByRole("link", { name: /Minha biblioteca/ })).toHaveAttribute("href", "/meus-mascotes");
});

test("relatórios não ficam expostos como rota do produto", async ({ request }) => {
  expect((await request.get("/relatorios")).status()).toBe(404);
  expect((await request.get("/api/mascot/reports")).status()).toBe(404);
});

test("percorre o fluxo explícito sem ações prematuras", async ({ page }) => {
  await page.goto("/criar");
  await expect(page.getByRole("heading", { level: 1, name: "Puleiro do GRU" })).toBeVisible();
  await selectPhoto(page);
  await expect(page.getByRole("heading", { name: "Esta é a foto certa?" })).toBeVisible();
  await expect(page.getByText("Nada foi enviado ainda")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gostei deste" })).toHaveCount(0);
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await expect(page.getByRole("heading", { name: "O que deve virar mascote?" })).toBeVisible();
  await page.getByRole("radio", { name: /Pessoa/ }).check();
  await page.getByRole("button", { name: "Confirmar e começar" }).click();
  await expect(page.getByRole("heading", { name: /Enviando sua foto|Abrindo o ovo|Preparando o nascimento/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gostei deste" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Seu mascote chegou!" })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Gostei deste" }).click();
  await expect(page.getByRole("heading", { name: "Como ele fica quando está pronto?" })).toBeVisible();
});

for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
  test(`aceita e mostra prévia de ${mimeType}`, async ({ page }) => {
    await page.goto("/criar");
    await selectPhoto(page, mimeType);
    await expect(page.locator(".stage__art img")).toHaveAttribute("src", /^blob:/);
    await expect(page.getByRole("button", { name: "Usar esta foto" })).toBeVisible();
  });
}

test("rejeita somente um arquivo que não é imagem", async ({ page }) => {
  await page.goto("/criar");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.locator("#pet-photo").setInputFiles({ name: "pet.txt", mimeType: "text/plain", buffer: Buffer.from("não é imagem") });
  await expect(page.locator(".field-error")).toContainText("JPEG, PNG ou WebP");
});

test("comprime automaticamente uma imagem válida acima do limite de transporte", async ({ page }) => {
  const pixels = randomBytes(2_048 * 2_048 * 3);
  const largePng = await sharp(pixels, { raw: { width: 2_048, height: 2_048, channels: 3 } })
    .png({ compressionLevel: 0, adaptiveFiltering: false })
    .toBuffer();
  expect(largePng.byteLength).toBeGreaterThan(10 * 1024 * 1024);

  await page.goto("/criar");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.locator("#pet-photo").setInputFiles({ name: "foto-grande.png", mimeType: "image/png", buffer: largePng });
  await expect(page.getByRole("heading", { name: "Esta é a foto certa?" })).toBeVisible();
  await expect(page.locator(".field-error")).toHaveCount(0);
});

test("permite remover e substituir antes do envio", async ({ page }) => {
  await page.goto("/criar");
  await selectPhoto(page);
  await page.getByRole("button", { name: "Remover foto" }).click();
  await expect(page.getByRole("heading", { name: "Quem vai nascer no Puleiro?" })).toBeVisible();
  await page.locator("#pet-photo").setInputFiles({ name: "outro.jpg", mimeType: "image/jpeg", buffer: sourcePhoto });
  await page.getByRole("button", { name: "Trocar foto" }).click();
  await expect(page.getByRole("button", { name: "Escolher foto" })).toBeVisible();
});

test("API cria job, informa processamento e disponibiliza três Masters", async ({ request }) => {
  const created = await request.post("/api/mascot/jobs", {
    multipart: { photo: { name: "pet.jpg", mimeType: "image/jpeg", buffer: sourcePhoto }, ...humanIdentity },
  });
  expect(created.status()).toBe(202);
  const id = (await created.json()).job.id as string;
  const processing = await request.get(`/api/mascot/jobs/${id}`);
  expect(["queued", "generating_masters", "awaiting_master_approval"]).toContain((await processing.json()).job.status);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const finished = await request.get(`/api/mascot/jobs/${id}`);
  const finishedJob = (await finished.json()).job;
  expect(finishedJob.status).toBe("awaiting_master_approval");
  expect(finishedJob.masters).toHaveLength(3);
});

test("API rejeita job inexistente e conteúdo incompatível com o MIME", async ({ request }) => {
  expect((await request.get("/api/mascot/jobs/inexistente")).status()).toBe(404);
  const invalid = await request.post("/api/mascot/jobs", {
    multipart: { photo: { name: "falso.jpg", mimeType: "image/jpeg", buffer: Buffer.from("falso") }, ...humanIdentity },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).code).toBe("IMAGE_DECODE_FAILED");
});

test("falha do job preserva foto e oferece retry", async ({ page }) => {
  await page.route("**/api/mascot/jobs", (route) => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ job: { id: "falha", attemptId: "attempt-falha", status: "queued", message: "Preparando…", generationScheduled: false, masters: [], ...jobIdentity } }),
  }));
  await page.route("**/api/mascot/jobs/falha", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ job: { id: "falha", attemptId: "attempt-falha", status: "failed", message: "O ovo não abriu.", generationScheduled: false, masters: [], retryable: true, ...jobIdentity } }),
  }));
  await page.goto("/criar");
  await selectPhoto(page);
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await page.getByRole("radio", { name: /Pessoa/ }).check();
  await page.getByRole("button", { name: "Confirmar e começar" }).click();
  await expect(page.getByRole("heading", { name: "Este nascimento precisa de outra tentativa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trocar foto" })).toBeVisible();
});

test("uma foto inválida não oferece retry para o mesmo arquivo", async ({ page }) => {
  await page.route("**/api/mascot/jobs", (route) => route.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({
      code: "IMAGE_DECODE_FAILED",
      message: "Não foi possível abrir esta imagem.",
    }),
  }));
  await page.goto("/criar");
  await selectPhoto(page);
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await page.getByRole("radio", { name: /Pessoa/ }).check();
  await page.getByRole("button", { name: "Confirmar e começar" }).click();
  await expect(page.getByRole("heading", { name: "Este nascimento precisa de outra tentativa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Trocar foto" })).toBeVisible();
});

test("timeout encerra polling sem criar novo POST automaticamente", async ({ page }) => {
  let creations = 0;
  await page.route("**/api/mascot/jobs", (route) => {
    creations += 1;
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job: { id: `lento-${creations}`, attemptId: "attempt-lento", status: "queued", message: "Preparando…", generationScheduled: false, masters: [], ...jobIdentity } }),
    });
  });
  await page.route("**/api/mascot/jobs/lento-*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ job: { id: "lento", attemptId: "attempt-lento", status: "generating_masters", message: "Criando…", generationScheduled: true, masters: [], ...jobIdentity } }),
  }));
  await page.goto("/criar");
  await selectPhoto(page);
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  await page.getByRole("radio", { name: /Pessoa/ }).check();
  await page.getByRole("button", { name: "Confirmar e começar" }).click();
  await expect(page.getByRole("heading", { name: "Este nascimento precisa de outra tentativa" })).toBeVisible({ timeout: 4_000 });
  await expect.poll(() => creations).toBe(1);
});

test("ver outra opção percorre os Masters existentes sem novo job", async ({ page }) => {
  await page.goto("/criar");
  await completeFlow(page);
  await page.getByRole("button", { name: "Ver outra opção" }).click();
  await expect(page.getByText(/opção 2 de 3/)).toBeVisible();
});

test("ajusta uma foto pequena e permite continuar", async ({ page }) => {
  const buffer = await sharp({
    create: { width: 255, height: 300, channels: 3, background: { r: 116, g: 131, b: 70 } },
  }).jpeg().toBuffer();
  await page.goto("/criar");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.locator("#pet-photo").setInputFiles({ name: "pequena.jpg", mimeType: "image/jpeg", buffer });
  await expect(page.getByRole("heading", { name: "Esta é a foto certa?" })).toBeVisible();
  await expect(page.locator(".field-error")).toHaveCount(0);
});

test("retoma job já aprovado sem acusar ausência de Masters", async ({ page }) => {
  await page.route("**/api/mascot/jobs/current", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      job: {
        id: "aprovado",
        attemptId: "attempt-aprovado",
        status: "master_approved",
        message: "Mascote mestre aprovado.",
        generationScheduled: true,
        masters: [{ id: "master_3", imageUrl: "/api/mascot/jobs/aprovado/master/master_3" }],
        approvedMasterId: "master_3",
        ...jobIdentity,
      },
    }),
  }));
  await page.goto("/criar");
  await expect(page.getByRole("heading", { name: "Como ele fica quando está pronto?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Este nascimento precisa de outra tentativa" })).toHaveCount(0);
  await expect(page.locator(".stage__art img")).toHaveAttribute("src", "/api/mascot/jobs/aprovado/master/master_3");
});

test("retoma geração de poses por GET e preserva o Master inteiro", async ({ page }) => {
  let posePosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/pose-generations")) posePosts += 1;
  });
  await page.route("**/api/mascot/jobs/current", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      job: {
        id: "poses-em-andamento",
        attemptId: "attempt-poses-em-andamento",
        status: "generating_poses",
        message: "Preparando os jeitos do seu mascote…",
        generationScheduled: true,
        masters: [{ id: "master_1", imageUrl: "/assets/puleiro-reveal.jpg" }],
        approvedMasterId: "master_1",
        ...jobIdentity,
      },
    }),
  }));

  await page.goto("/criar");
  await expect(page.getByRole("heading", { name: "Experimentando os três jeitos" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Operação de poses confirmada" })).toHaveAttribute("aria-valuenow", "25");
  await expect(page.locator(".pose-workshop-motion li")).toHaveText(["01 Normal", "02 Ouvindo", "03 Transcrevendo"]);
  await expect(page.locator("#puleiro-stage")).toHaveClass(/stage--master-reference/);
  expect(await page.locator(".stage__art img").evaluate((image) => getComputedStyle(image).objectFit)).toBe("contain");
  expect(await page.locator(".stage__art img").evaluate((image) => getComputedStyle(image).objectPosition)).toBe("50% 50%");
  expect(posePosts).toBe(0);
});

test("mostra somente progresso de nascimento confirmado pelo backend", async ({ page }) => {
  await page.route("**/api/mascot/jobs/current", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      job: {
        id: "master-em-andamento",
        attemptId: "attempt-master-em-andamento",
        status: "generating_masters",
        message: "Criando o mascote mestre…",
        generationScheduled: true,
        masters: [],
        poses: [],
        ...jobIdentity,
      },
    }),
  }));

  await page.goto("/criar");
  await expect(page.getByRole("progressbar", { name: "Mascote mestre em criação" })).toHaveAttribute("aria-valuenow", "75");
  await expect(page.locator(".stage-progress-seal")).toHaveText("75%");
  await expect(page.locator(".egg-crack")).toHaveCount(2);
});

test("conjunto pronto é guardado uma vez e recebe código da biblioteca", async ({ page }) => {
  let completionPosts = 0;
  await page.route("**/api/mascot/jobs/current", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      job: {
        id: "poses-prontas",
        attemptId: "attempt-poses-prontas",
        status: "awaiting_set_approval",
        message: "As três poses estão prontas.",
        generationScheduled: true,
        masters: [{ id: "master_1", imageUrl: "/assets/puleiro-reveal.jpg" }],
        approvedMasterId: "master_1",
        poses: ["normal", "listening", "transcribing"].map((role) => ({ id: `pose-${role}`, role, optionId: `${role}_choice`, label: role, imageUrl: "/assets/puleiro-reveal.jpg" })),
        ...jobIdentity,
      },
    }),
  }));
  await page.route("**/api/mascot/jobs/poses-prontas/complete", async (route) => {
    completionPosts += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ item: { id: "library-1", mascotCode: "GRU-ABCD-2345", jobId: "poses-prontas", attemptId: "attempt-poses-prontas", masterId: "master_1", createdAt: "2026-08-17T00:00:00Z", poses: [] } }),
    });
  });
  await page.goto("/criar");
  await expect(page.getByRole("heading", { name: "Seu GRU está pronto" })).toBeVisible();
  await expect(page.getByText("GRU-ABCD-2345")).toBeVisible();
  expect(completionPosts).toBe(1);
  await page.getByRole("button", { name: "Criar outro mascote" }).click();
  await expect(page.getByRole("heading", { name: "Quem vai nascer no Puleiro?" })).toBeVisible();
});

test("uma nova foto não é substituída pela retomada de um mascote já concluído", async ({ page }) => {
  await page.route("**/api/mascot/jobs/current", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        job: {
          id: "mascote-antigo",
          attemptId: "tentativa-antiga",
          status: "awaiting_set_approval",
          message: "As três poses estão prontas.",
          generationScheduled: true,
          masters: [{ id: "master_1", imageUrl: "/assets/puleiro-reveal.jpg" }],
          approvedMasterId: "master_1",
          poses: ["normal", "listening", "transcribing"].map((role) => ({ id: `pose-${role}`, role, optionId: `${role}_choice`, label: role, imageUrl: "/assets/puleiro-reveal.jpg" })),
          ...jobIdentity,
        },
      }),
    });
  });
  await page.goto("/criar");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await page.locator("#pet-photo").setInputFiles({ name: "novo.jpg", mimeType: "image/jpeg", buffer: sourcePhoto });
  await expect(page.getByRole("heading", { name: "Esta é a foto certa?" })).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByRole("heading", { name: "Esta é a foto certa?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu GRU está pronto" })).toHaveCount(0);
});

test("escolhe uma pose por função sem acionar GPU quando a flag está desligada", async ({ page }) => {
  let posePosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/pose-generations")) posePosts += 1;
  });
  await page.goto("/criar");
  await completeFlow(page);
  await page.getByRole("button", { name: "Gostei deste" }).click();
  await expect(page.locator(".pose-choice-grid .pose-reference-preview")).toHaveCount(4);
  await page.getByRole("radio", { name: /Relaxado/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("radio", { name: /Reação natural/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("radio", { name: /Organizando ideias/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Revise os jeitos do seu mascote" })).toBeVisible();
  await expect(page.locator(".pose-summary .pose-reference-preview")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Gerar as três poses" })).toBeDisabled();
  expect(posePosts).toBe(0);
});

test("movimento reduzido preserva conteúdo e remove loops", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/criar");
  await completeFlow(page);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await expect(page.locator(".curtain")).toHaveCount(0);
  await context.close();
});

test("teclado, nomes acessíveis e contraste básico", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/criar");
  const button = page.getByRole("button", { name: "Criar meu mascote" });
  await button.focus();
  expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Escolher foto" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("touch targets mantêm pelo menos 48 px na prévia móvel", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/criar");
  await selectPhoto(page);
  for (const control of await page.locator(".site-shell button:visible, .site-shell a:visible").all()) {
    const box = await control.boundingBox();
    const name = await control.getAttribute("aria-label") ?? await control.textContent() ?? "control";
    expect(box?.width, name).toBeGreaterThanOrEqual(48);
    expect(box?.height, name).toBeGreaterThanOrEqual(48);
  }
});

for (const orientation of ["vertical", "horizontal"] as const) {
  test(`prévia ${orientation} permanece contida no palco`, async ({ page }) => {
    const dimensions = orientation === "vertical" ? { width: 600, height: 900 } : { width: 900, height: 600 };
    const buffer = await sharp({
      create: { ...dimensions, channels: 3, background: { r: 116, g: 131, b: 70 } },
    }).jpeg().toBuffer();
    await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/criar");
    await page.getByRole("button", { name: "Criar meu mascote" }).click();
    await page.locator("#pet-photo").setInputFiles({ name: `${orientation}.jpg`, mimeType: "image/jpeg", buffer });
    const art = await page.locator(".stage__art").boundingBox();
    const image = await page.locator(".stage__art img").boundingBox();
    expect(image?.x).toBeCloseTo(art?.x ?? 0, 0);
    expect(image?.y).toBeCloseTo(art?.y ?? 0, 0);
    expect(image?.width).toBeCloseTo(art?.width ?? 0, 0);
    expect(Math.abs((image?.height ?? 0) - (art?.height ?? 0))).toBeLessThanOrEqual(2);
  });
}

for (const width of [360, 390, 430, 768, 1024, 1440]) {
  test(`reflow sem rolagem horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
  await page.goto("/criar");
    await page.getByRole("button", { name: "Criar meu mascote" }).click();
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  });
}

test("zoom de 200% mantém uma única composição responsiva", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/criar");
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  const stage = page.locator("#puleiro-stage");
  const note = page.locator(".editorial-note");
  expect((await note.boundingBox())?.y).toBeGreaterThan((await stage.boundingBox())?.y ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});

test("entrada de criação cabe em um viewport desktop sem esconder conteúdo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/criar");
  const entrySize = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(entrySize.scrollHeight).toBeLessThanOrEqual(entrySize.clientHeight);
  await page.getByRole("button", { name: "Criar meu mascote" }).click();
  await expect(page.getByRole("heading", { name: "Quem vai nascer no Puleiro?" })).toBeVisible();
  const pageSize = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(pageSize.scrollHeight).toBeLessThanOrEqual(pageSize.clientHeight);
});
