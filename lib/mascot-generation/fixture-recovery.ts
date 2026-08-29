export type FixtureRecoveryIds = {
  itemId: string;
  packageId: string;
  importCodeId: string;
};

export type FixtureRecoveryRegistry = FixtureRecoveryIds & {
  sourceJobId: string;
  storagePaths: readonly string[];
  storageCleanupVerified: boolean;
  storageObjectsRemaining: number;
};

export type FixtureRecoveryRecord = {
  id: string;
  userId: string;
  parentId: string;
};

export type FixtureRecoveryGateway = {
  getImportCode(id: string): Promise<FixtureRecoveryRecord | null>;
  getPackage(id: string): Promise<FixtureRecoveryRecord | null>;
  getItem(id: string): Promise<FixtureRecoveryRecord | null>;
  deleteImportCode(id: string): Promise<void>;
  deletePackage(id: string): Promise<void>;
  deleteItem(id: string): Promise<void>;
  remaining(ids: FixtureRecoveryIds): Promise<{ items: number; packages: number; codes: number }>;
};

export function assertVerifiedFixtureStorage(registry: FixtureRecoveryRegistry) {
  if (!registry.storageCleanupVerified || registry.storageObjectsRemaining !== 0) {
    throw new Error("FIXTURE_STORAGE_CLEANUP_UNVERIFIED");
  }
  if (registry.storagePaths.length !== 3 || new Set(registry.storagePaths).size !== 3) {
    throw new Error("FIXTURE_RECOVERY_RECORD_INVALID");
  }
}

export async function recoverExactFixtureDatabase(
  registry: FixtureRecoveryRegistry,
  userId: string,
  gateway: FixtureRecoveryGateway,
) {
  assertVerifiedFixtureStorage(registry);
  await assertExactRecords(registry, userId, gateway);
  await deleteIfPresent(registry.importCodeId, gateway.getImportCode, gateway.deleteImportCode);
  await deleteIfPresent(registry.packageId, gateway.getPackage, gateway.deletePackage);
  await deleteIfPresent(registry.itemId, gateway.getItem, gateway.deleteItem);
  const remaining = await gateway.remaining(registry);
  if (remaining.items || remaining.packages || remaining.codes) {
    throw new Error("FIXTURE_DB_CLEANUP_RESIDUE");
  }
  return remaining;
}

async function assertExactRecords(registry: FixtureRecoveryRegistry, userId: string, gateway: FixtureRecoveryGateway) {
  const [code, packageRow, item] = await Promise.all([
    gateway.getImportCode(registry.importCodeId),
    gateway.getPackage(registry.packageId),
    gateway.getItem(registry.itemId),
  ]);
  assertRecord(code, registry.importCodeId, userId, registry.packageId);
  assertRecord(packageRow, registry.packageId, userId, registry.itemId);
  assertRecord(item, registry.itemId, userId, registry.sourceJobId);
}

function assertRecord(record: FixtureRecoveryRecord | null, id: string, userId: string, expectedParentId: string | null) {
  if (!record) return;
  if (record.id !== id || record.userId !== userId || (expectedParentId !== null && record.parentId !== expectedParentId)) {
    throw new Error("FIXTURE_RECOVERY_RECORD_CONFLICT");
  }
}

async function deleteIfPresent(
  id: string,
  get: (id: string) => Promise<FixtureRecoveryRecord | null>,
  remove: (id: string) => Promise<void>,
) {
  if (await get(id)) await remove(id);
}
