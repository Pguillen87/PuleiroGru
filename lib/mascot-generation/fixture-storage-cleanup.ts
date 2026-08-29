export type FixtureStorageCleanupResult = {
  storageObjectsExpected: number;
  storageObjectsRemaining: number;
  storageCleanupVerified: boolean;
};

export type FixtureStorageCleanupGateway = {
  removeExact(paths: readonly string[]): Promise<void>;
  objectExistsExact(path: string): Promise<boolean>;
};

export type FixtureStorageVerifyResult = {
  objectIndex: number;
  operation: "verify";
  httpStatus: number | null;
  result: "exists" | "not_found" | "verify_error";
  safeErrorCode: string | null;
  errorName?: "StorageApiError" | "StorageUnknownError" | "Unknown" | null;
  safeMessage?: string | null;
  pathPresent?: boolean;
  bucketPresent?: boolean;
  authPresent?: boolean;
  durationMs: number;
};

export type FixtureStorageVerifyGateway = {
  verifyExact(path: string): Promise<FixtureStorageVerificationResponse>;
};

export type FixtureStorageVerificationResponse = {
  exists: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  errorName?: "StorageApiError" | "StorageUnknownError" | "Unknown" | null;
  safeMessage?: string | null;
  pathPresent?: boolean;
  bucketPresent?: boolean;
  authPresent?: boolean;
};

export type FixtureStorageVerificationSummary = {
  storageObjectsExpected: number;
  storageObjectsRemaining: number;
  storageCleanupVerified: boolean;
};

/**
 * Removes and verifies only the concrete paths created by one fixture run.
 * This deliberately has no list, prefix, owner, or pattern-based operation.
 */
export async function removeAndVerifyFixtureStorage(
  registeredPaths: readonly string[],
  gateway: FixtureStorageCleanupGateway,
): Promise<FixtureStorageCleanupResult> {
  const exactPaths = uniqueExactPaths(registeredPaths);
  await gateway.removeExact(exactPaths);
  const exists = await Promise.all(exactPaths.map((path) => gateway.objectExistsExact(path)));
  const storageObjectsRemaining = exists.filter(Boolean).length;
  return {
    storageObjectsExpected: exactPaths.length,
    storageObjectsRemaining,
    storageCleanupVerified: storageObjectsRemaining === 0,
  };
}

function uniqueExactPaths(paths: readonly string[]) {
  return [...new Set(paths)];
}

/**
 * Inspects only the exact object paths registered by one fixture run. It never
 * lists, removes, or returns a path to callers.
 */
export async function verifyExactFixtureStorage(
  registeredPaths: readonly string[],
  gateway: FixtureStorageVerifyGateway,
): Promise<FixtureStorageVerifyResult[]> {
  const exactPaths = uniqueExactPaths(registeredPaths);
  return Promise.all(exactPaths.map(async (path, objectIndex) => {
    const startedAt = Date.now();
    try {
      const verification = await gateway.verifyExact(path);
      return classifyFixtureStorageVerification(objectIndex, verification, Date.now() - startedAt);
    } catch {
      return {
        objectIndex,
        operation: "verify",
        httpStatus: null,
        result: "verify_error",
        safeErrorCode: "FIXTURE_STORAGE_VERIFY_SDK_FAILED", errorName: "Unknown", safeMessage: "Falha ao consultar o Storage.",
        pathPresent: true, bucketPresent: true, authPresent: true,
        durationMs: Date.now() - startedAt,
      };
    }
  }));
}

export function classifyFixtureStorageVerification(
  objectIndex: number,
  verification: FixtureStorageVerificationResponse,
  durationMs: number,
): FixtureStorageVerifyResult {
  const context = { errorName: verification.errorName ?? null, safeMessage: verification.safeMessage ?? null, pathPresent: verification.pathPresent ?? true, bucketPresent: verification.bucketPresent ?? true, authPresent: verification.authPresent ?? true };
  if (verification.exists === true) return { objectIndex, operation: "verify", httpStatus: verification.httpStatus ?? 200, result: "exists", safeErrorCode: null, ...context, durationMs };
  if (verification.exists === false && (verification.httpStatus === 400 || verification.httpStatus === 404)) {
    return { objectIndex, operation: "verify", httpStatus: verification.httpStatus, result: "not_found", safeErrorCode: null, ...context, durationMs };
  }
  return {
    objectIndex,
    operation: "verify",
    httpStatus: verification.httpStatus,
    result: "verify_error",
    safeErrorCode: fixtureStorageVerifyErrorCode(verification.httpStatus, verification.errorCode),
    ...context,
    durationMs,
  };
}

export function summarizeFixtureStorageVerification(results: readonly FixtureStorageVerifyResult[]): FixtureStorageVerificationSummary {
  const storageObjectsRemaining = results.filter((result) => result.result === "exists").length;
  const hasVerifyError = results.some((result) => result.result === "verify_error");
  return {
    storageObjectsExpected: results.length,
    storageObjectsRemaining,
    storageCleanupVerified: !hasVerifyError && storageObjectsRemaining === 0,
  };
}

function fixtureStorageVerifyErrorCode(status: number | null, errorCode: string | null) {
  if (status === 401 || status === 403) return "FIXTURE_STORAGE_VERIFY_AUTH_FAILED";
  if (status !== null && status >= 500) return "FIXTURE_STORAGE_VERIFY_BACKEND_FAILED";
  return errorCode ?? "FIXTURE_STORAGE_VERIFY_SDK_FAILED";
}
