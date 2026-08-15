import "server-only";

export type MascotProviderName = "mock" | "modal";

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

export const generationConfig = {
  provider: (process.env.MASCOT_GENERATION_PROVIDER ?? "mock") as MascotProviderName,
  maxUploadBytes: positiveNumber(process.env.MAX_UPLOAD_SIZE_MB, 10) * 1024 * 1024,
  maxImageDimension: positiveNumber(process.env.MAX_IMAGE_DIMENSION, 4096),
  mockDelayMs: positiveNumber(process.env.MOCK_GENERATION_DELAY_MS, 1_800),
  modalApiUrl: process.env.MODAL_MASCOT_API_URL?.replace(/\/$/, "") ?? "",
  modalBffJwtSecret: process.env.MODAL_BFF_JWT_SECRET ?? "",
  modalJwtIssuer: process.env.MODAL_BFF_JWT_ISSUER ?? "puleiro-bff",
  modalJwtAudience: process.env.MODAL_BFF_JWT_AUDIENCE ?? "gru-modal",
  modalJwtTtlSeconds: Math.min(positiveNumber(process.env.MODAL_BFF_JWT_TTL_SECONDS, 90), 120),
  registrationEnabled: enabled(process.env.REGISTRATION_ENABLED, true),
  masterGenerationEnabled: enabled(process.env.MASTER_GENERATION_ENABLED, false),
  poseGenerationEnabled: enabled(process.env.POSE_GENERATION_ENABLED, false),
  allowDevTestIdentity: enabled(process.env.ALLOW_DEV_TEST_IDENTITY, false),
};

export function publicGenerationConfig() {
  return {
    maxUploadBytes: generationConfig.maxUploadBytes,
    pollIntervalMs: positiveNumber(process.env.JOB_POLL_INTERVAL_MS, 900),
    timeoutMs: positiveNumber(process.env.JOB_TIMEOUT_MS, 90_000),
    technicalRegistrationOnly: generationConfig.provider === "modal" && !generationConfig.masterGenerationEnabled,
    masterGenerationEnabled: generationConfig.masterGenerationEnabled,
    authenticationRequired: generationConfig.provider === "modal" && !generationConfig.allowDevTestIdentity,
  };
}
