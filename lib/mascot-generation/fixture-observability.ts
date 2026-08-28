export const fixtureStages = [
  "FIXTURE_ITEM_CREATE",
  "FIXTURE_PROVIDER_FETCH",
  "FIXTURE_SOURCE_ASSET_READ",
  "FIXTURE_ASSET_VALIDATE",
  "FIXTURE_STORAGE_WRITE",
  "FIXTURE_MANIFEST_BUILD",
  "FIXTURE_IMPORT_CODE_CREATE",
  "FIXTURE_READY_PROMOTION",
  "FIXTURE_CLEANUP",
] as const;

export type FixtureStage = typeof fixtureStages[number];
export type FixtureOutcome = "started" | "succeeded" | "failed";

const errorCodes: Record<FixtureStage, string> = {
  FIXTURE_ITEM_CREATE: "FIXTURE_ITEM_CREATE_FAILED",
  FIXTURE_PROVIDER_FETCH: "FIXTURE_PROVIDER_FETCH_FAILED",
  FIXTURE_SOURCE_ASSET_READ: "FIXTURE_SOURCE_ASSET_READ_FAILED",
  FIXTURE_ASSET_VALIDATE: "FIXTURE_ASSET_VALIDATE_FAILED",
  FIXTURE_STORAGE_WRITE: "FIXTURE_STORAGE_WRITE_FAILED",
  FIXTURE_MANIFEST_BUILD: "FIXTURE_MANIFEST_BUILD_FAILED",
  FIXTURE_IMPORT_CODE_CREATE: "FIXTURE_IMPORT_CODE_CREATE_FAILED",
  FIXTURE_READY_PROMOTION: "FIXTURE_READY_PROMOTION_FAILED",
  FIXTURE_CLEANUP: "FIXTURE_CLEANUP_FAILED",
};

export class FixtureStageError extends Error {
  constructor(readonly stage: FixtureStage, readonly safeErrorCode: string = errorCodes[stage]) {
    super(safeErrorCode);
  }
}

function safeTechnicalCode(error: unknown) {
  if (error instanceof FixtureStageError) return error.safeErrorCode;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{2,80}$/.test(code)) return code;
  }
  return "UNKNOWN_ERROR";
}

export function fixtureFailure(stage: FixtureStage, error: unknown): FixtureStageError {
  void error;
  return new FixtureStageError(stage);
}

export function fixtureErrorResponse(error: unknown, fallbackStage: FixtureStage) {
  if (error instanceof FixtureStageError) return { stage: error.stage, safeErrorCode: error.safeErrorCode };
  return { stage: fallbackStage, safeErrorCode: errorCodes[fallbackStage] };
}

export class FixtureAudit {
  readonly operationId = `fixture-${crypto.randomUUID()}`;
  private currentStage: FixtureStage;
  private startedAt = Date.now();
  private active = false;

  constructor(initialStage: FixtureStage = "FIXTURE_ITEM_CREATE") {
    this.currentStage = initialStage;
  }

  start(stage: FixtureStage, count?: number) {
    if (this.active) this.succeed();
    this.currentStage = stage;
    this.startedAt = Date.now();
    this.active = true;
    this.write(stage, "started", undefined, count);
  }

  succeed(count?: number) {
    if (!this.active) return;
    this.write(this.currentStage, "succeeded", undefined, count);
    this.active = false;
  }

  fail(error: unknown, count?: number): FixtureStageError {
    const failure = fixtureFailure(this.currentStage, error);
    this.write(this.currentStage, "failed", failure.safeErrorCode, count, safeTechnicalCode(error));
    this.active = false;
    return failure;
  }

  get stage() { return this.currentStage; }

  private write(stage: FixtureStage, outcome: FixtureOutcome, safeErrorCode?: string, count?: number, technicalCode?: string) {
    console.info("staging_package_fixture", {
      operationId: this.operationId,
      stage,
      outcome,
      safeErrorCode,
      technicalCode,
      durationMs: Date.now() - this.startedAt,
      ...(count === undefined ? {} : { count }),
    });
  }
}
