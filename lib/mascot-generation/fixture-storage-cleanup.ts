export type FixtureStorageCleanupResult = {
  storageObjectsExpected: number;
  storageObjectsRemaining: number;
  storageCleanupVerified: boolean;
};

export type FixtureStorageCleanupGateway = {
  removeExact(paths: readonly string[]): Promise<void>;
  objectExistsExact(path: string): Promise<boolean>;
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
