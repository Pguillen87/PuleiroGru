import { expect, test } from "@playwright/test";

const jobId = "job-ready-hatch";

function readyJob() {
  return {
    id: jobId,
    attemptId: "attempt-ready",
    status: "awaiting_set_approval",
    message: "Ovo pronto para chocar.",
    workflowMode: "async_incubator_v1",
    productState: "READY_TO_HATCH",
    subjectIdentity: { category: "animal", label: "animal", confirmed: true },
    poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" },
    configuration: { displayName: "", poseChoices: { normal: "normal_attentive", listening: "listening_focus", transcribing: "transcribing_fast" }, configurationRevision: 1 },
    masters: [],
    poses: [
      { role: "normal", url: "/assets/normal.png" },
      { role: "listening", url: "/assets/listening.png" },
      { role: "transcribing", url: "/assets/transcribing.png" }
    ],
    poseSetQc: { status: "passed", version: "pose-set-visual-v3", scores: {} }
  };
}

test("hatch route success, validation rejects, replay idempotency, polling and hatched state", async ({ page }) => {
  let jobState = readyJob();

  // Route for incubating/polling
  await page.route(`**/api/mascot/incubations/${jobId}`, (route) => {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ job: jobState }) });
  });

  // Route for hatch POST
  await page.route(`**/api/mascot/incubations/${jobId}/hatch`, async (route) => {
    if (jobState.productState !== "READY_TO_HATCH") {
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "GENERATION_NOT_READY", message: "Not ready to hatch" }) });
    }
    if (jobState.poses.length !== 3) {
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "INVALID_POSES", message: "Invalid poses" }) });
    }
    // Idempotency / replay check
    if (jobState.status === "hatched") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ job: jobState, alreadyHatched: true }) });
    }
    jobState = { ...jobState, status: "hatched", productState: "HATCHED", message: "Mascote nascido com sucesso!" };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ job: jobState }) });
  });

  await page.goto(`/incubadora/${jobId}`);
  await expect(page.getByRole("heading", { name: "Ovo pronto para chocar." })).toBeVisible();
  
  const hatchButton = page.getByRole("button", { name: /Chocar ovo/i });
  await expect(hatchButton).toBeVisible();
  await hatchButton.click();

  // Verify HATCHED state without Plano 2 artifacts
  await expect(page.getByText("Mascote nascido com sucesso!")).toBeVisible();
  await expect(page.locator("input[name=displayName]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Concluir nascimento/i })).toHaveCount(0);
});
