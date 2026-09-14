import { expect, test } from "@playwright/test";

const egg = { attemptId: "incubator-new-birth", jobId: "job-new", productState: "INCUBATING", phase: "generating_masters", createdAt: "2026-09-13T14:46:00Z", updatedAt: "2026-09-13T14:48:00Z", poseCount: 0 };

test("Incubadora mostra datas completas, estimativa e mantém acesso na navegação", async ({ page }) => {
  await page.route("**/api/mascot/incubations", (route) => route.fulfill({ json: { incubations: [egg] } }));
  await page.route("**/api/mascot/incubations/timing", (route) => route.fulfill({ json: { averageMs: 600_000, sampleCount: 20 } }));
  await page.goto("/incubadora?created=incubator-new-birth");
  await expect(page.getByRole("heading", { name: "Incubadora", exact: true })).toBeVisible();
  await expect(page.getByText(/Pedido em/)).toContainText("13/09/2026, 11:46:00");
  await expect(page.getByText(/Última atualização:/)).toContainText("11:48:00");
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(page.getByText(/últimas 20 incubações concluídas/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Acompanhar", exact: true })).toHaveAttribute("href", "/incubadora/job-new");
  await expect(page.locator('[data-new="true"]')).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Acompanhar", exact: true })).toBeVisible();
});

test("falha de leitura não aparece como lista vazia e permite recuperação", async ({ page }) => {
  let available = false;
  await page.route("**/api/mascot/incubations", (route) => {
    return !available ? route.fulfill({ status: 503, json: { message: "Não foi possível atualizar a Incubadora." } })
      : route.fulfill({ json: { incubations: [egg] } });
  });
  await page.route("**/api/mascot/incubations/timing", (route) => route.fulfill({ json: { averageMs: null, sampleCount: 0 } }));
  await page.goto("/incubadora");
  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível atualizar" })).toBeVisible();
  await expect(page.getByText("Nenhum nascimento neste filtro")).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("link", { name: "Acompanhar", exact: true })).toBeVisible();
  await expect(page.getByText(/Ainda não há histórico suficiente/)).toBeVisible();
});

test("job órfão mostra falha operacional e remoção protegida", async ({ page }) => {
  let retired = false;
  const orphan = { attemptId: "attempt-orphan-123456", jobId: "job-orphan", productState: "RECOVERY_REQUIRED", phase: "master_approved", createdAt: "2026-08-31T16:33:00Z", updatedAt: "2026-08-31T21:54:37Z", poseCount: 0, recoveryCode: "INCUBATION_JOB_GONE" };
  await page.route("**/api/mascot/incubations", (route) => route.fulfill({ json: { incubations: retired ? [] : [orphan] } }));
  await page.route("**/api/mascot/incubations/timing", (route) => route.fulfill({ json: { averageMs: null, sampleCount: 0 } }));
  await page.route("**/api/mascot/incubations/job-orphan/retire", async (route) => {
    retired = true;
    await route.fulfill({ json: { retired: true, idempotentReplay: false } });
  });

  await page.goto("/incubadora");
  await expect(page.getByText("Processamento não disponível")).toBeVisible();
  await expect(page.getByText("Este nascimento perdeu o vínculo com o processamento.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver detalhes", exact: true })).toHaveAttribute("href", "/incubadora/job-orphan");
  await page.getByRole("button", { name: "Remover da Incubadora" }).click();
  await expect(page.getByRole("dialog")).toContainText("Mascotes concluídos e itens da biblioteca não serão afetados.");
  await page.getByRole("button", { name: "Confirmar remoção" }).click();
  await expect(page.getByRole("heading", { name: "Nenhum nascimento neste filtro" })).toBeVisible();
});

test("nascimento interrompido pode ser removido com confirmação", async ({ page }) => {
  let retired = false;
  const failed = { attemptId: "attempt-failed-123456", jobId: "job-failed", productState: "FAILED", phase: "failed", createdAt: "2026-09-14T16:11:52Z", updatedAt: "2026-09-14T16:33:15Z", poseCount: 0, recoveryCode: "POSE_GENERATION_FAILED" };
  await page.route("**/api/mascot/incubations", (route) => route.fulfill({ json: { incubations: retired ? [] : [failed] } }));
  await page.route("**/api/mascot/incubations/timing", (route) => route.fulfill({ json: { averageMs: null, sampleCount: 0 } }));
  await page.route("**/api/mascot/incubations/job-failed/retire", async (route) => {
    retired = true;
    await route.fulfill({ json: { retired: true, idempotentReplay: false } });
  });

  await page.goto("/incubadora");
  await expect(page.getByText("Nascimento interrompido")).toBeVisible();
  await expect(page.getByText("Abra os detalhes para entender a falha antes de qualquer recuperação.")).toBeVisible();
  await page.getByRole("button", { name: "Remover da Incubadora" }).click();
  await expect(page.getByRole("dialog")).toContainText("O processamento falhou e não será retomado.");
  await expect(page.getByRole("dialog")).toContainText("Mascotes concluídos e itens da biblioteca não serão afetados.");
  await page.getByRole("button", { name: "Confirmar remoção" }).click();
  await expect(page.getByRole("heading", { name: "Nenhum nascimento neste filtro" })).toBeVisible();
});
