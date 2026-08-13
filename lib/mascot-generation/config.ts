import "server-only";

export type MascotProviderName = "mock" | "modal";

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const generationConfig = {
  provider: (process.env.MASCOT_GENERATION_PROVIDER ?? "mock") as MascotProviderName,
  maxUploadBytes: positiveNumber(process.env.MAX_UPLOAD_SIZE_MB, 10) * 1024 * 1024,
  mockDelayMs: positiveNumber(process.env.MOCK_GENERATION_DELAY_MS, 1_800),
  modalApiUrl: process.env.MODAL_MASCOT_API_URL?.replace(/\/$/, "") ?? "",
  modalApiToken: process.env.MODAL_MASCOT_API_TOKEN ?? "",
  modalAppCheckToken: process.env.MODAL_MASCOT_APP_CHECK_TOKEN ?? "",
};

export function publicGenerationConfig() {
  return {
    maxUploadBytes: generationConfig.maxUploadBytes,
    pollIntervalMs: positiveNumber(process.env.JOB_POLL_INTERVAL_MS, 900),
    timeoutMs: positiveNumber(process.env.JOB_TIMEOUT_MS, 90_000),
  };
}
