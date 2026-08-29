import { describe, expect, it, vi } from "vitest";
import { assertVerifiedFixtureStorage, recoverExactFixtureDatabase, type FixtureRecoveryGateway, type FixtureRecoveryIds, type FixtureRecoveryRegistry } from "@/lib/mascot-generation/fixture-recovery";

const ids: FixtureRecoveryIds = { itemId: "item", packageId: "package", importCodeId: "code" };
const registry: FixtureRecoveryRegistry = { ...ids, sourceJobId: "source-job", storagePaths: ["x/normal", "x/listening", "x/transcribing"], storageCleanupVerified: true, storageObjectsRemaining: 0 };

function gateway(overrides: Partial<FixtureRecoveryGateway> = {}) {
  const records = new Map([
    ["code", { id: "code", userId: "qa", parentId: "package" }],
    ["package", { id: "package", userId: "qa", parentId: "item" }],
    ["item", { id: "item", userId: "qa", parentId: "source-job" }],
  ]);
  const get = vi.fn(async (id: string) => records.get(id) ?? null);
  const remove = vi.fn(async (id: string) => { records.delete(id); });
  return {
    getImportCode: get,
    getPackage: get,
    getItem: get,
    deleteImportCode: remove,
    deletePackage: remove,
    deleteItem: remove,
    remaining: vi.fn(async () => ({ items: 0, packages: 0, codes: 0 })),
    ...overrides,
  } satisfies FixtureRecoveryGateway;
}

describe("fixture exact database recovery", () => {
  it("skips Storage when the private registry has already verified it clean", async () => {
    const fixtureGateway = gateway();
    await expect(recoverExactFixtureDatabase(registry, "qa", fixtureGateway)).resolves.toEqual({ items: 0, packages: 0, codes: 0 });
    expect(fixtureGateway.deleteImportCode).toHaveBeenCalledWith("code");
    expect(fixtureGateway.deletePackage).toHaveBeenCalledWith("package");
    expect(fixtureGateway.deleteItem).toHaveBeenCalledWith("item");
  });

  it("blocks recovery if Storage is not server-side verified", () => {
    expect(() => assertVerifiedFixtureStorage({ ...registry, storageCleanupVerified: false })).toThrow("FIXTURE_STORAGE_CLEANUP_UNVERIFIED");
  });

  it("treats already absent records as completed cleanup phases", async () => {
    const fixtureGateway = gateway({ getImportCode: async () => null, getPackage: async () => null, getItem: async () => null });
    await expect(recoverExactFixtureDatabase(registry, "qa", fixtureGateway)).resolves.toEqual({ items: 0, packages: 0, codes: 0 });
    expect(fixtureGateway.deleteImportCode).not.toHaveBeenCalled();
    expect(fixtureGateway.deletePackage).not.toHaveBeenCalled();
    expect(fixtureGateway.deleteItem).not.toHaveBeenCalled();
  });

  it.each([
    ["code", "getImportCode", "deleteImportCode"],
    ["package", "getPackage", "deletePackage"],
    ["item", "getItem", "deleteItem"],
  ] as const)("continues when the exact %s record is already absent", async (id, getKey, deleteKey) => {
    const fixtureGateway = gateway({ [getKey]: async () => null });
    await expect(recoverExactFixtureDatabase(registry, "qa", fixtureGateway)).resolves.toEqual({ items: 0, packages: 0, codes: 0 });
    expect(fixtureGateway[deleteKey]).not.toHaveBeenCalledWith(id);
  });

  it("aborts before deleting when an exact record conflicts", async () => {
    const fixtureGateway = gateway({ getPackage: async () => ({ id: "package", userId: "qa", parentId: "other-item" }) });
    await expect(recoverExactFixtureDatabase(registry, "qa", fixtureGateway)).rejects.toThrow("FIXTURE_RECOVERY_RECORD_CONFLICT");
    expect(fixtureGateway.deleteImportCode).not.toHaveBeenCalled();
  });

  it("rejects a registry with non-exact Storage paths", () => {
    expect(() => assertVerifiedFixtureStorage({ ...registry, storagePaths: ["x/normal", "x/normal", "x/transcribing"] })).toThrow("FIXTURE_RECOVERY_RECORD_INVALID");
  });

  it("fails when any exact residual remains after replay", async () => {
    const fixtureGateway = gateway({ remaining: async () => ({ items: 0, packages: 1, codes: 0 }) });
    await expect(recoverExactFixtureDatabase(registry, "qa", fixtureGateway)).rejects.toThrow("FIXTURE_DB_CLEANUP_RESIDUE");
  });

  it("uses only the three registered identifiers", async () => {
    const fixtureGateway = gateway();
    await recoverExactFixtureDatabase(registry, "qa", fixtureGateway);
    expect(fixtureGateway.getImportCode).toHaveBeenCalledWith("code");
    expect(fixtureGateway.getPackage).toHaveBeenCalledWith("package");
    expect(fixtureGateway.getItem).toHaveBeenCalledWith("item");
  });
});
