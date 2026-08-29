import { describe, expect, it } from "vitest";
import { verifiedFixtureStorageEvidence } from "@/lib/mascot-generation/fixture-storage-evidence";

describe("server-derived fixture Storage evidence", () => {
  it("persists the exact three-object clean result", () => {
    const evidence = verifiedFixtureStorageEvidence({ storageObjectsExpected: 3, storageObjectsRemaining: 0, storageCleanupVerified: true });
    expect(evidence).toEqual({ storageObjectsExpected: 3, storageObjectsRemaining: 0, storageCleanupVerified: true });
  });

  it("rejects client-shaped or incomplete values that do not prove cleanup", () => {
    expect(() => verifiedFixtureStorageEvidence({ storageObjectsExpected: 3, storageObjectsRemaining: 0, storageCleanupVerified: false })).toThrow("FIXTURE_STORAGE_CLEANUP_UNVERIFIED");
    expect(() => verifiedFixtureStorageEvidence({ storageObjectsExpected: 2, storageObjectsRemaining: 0, storageCleanupVerified: true })).toThrow("FIXTURE_STORAGE_CLEANUP_UNVERIFIED");
  });

  it("is idempotent because the same server result produces the same registry patch", () => {
    const summary = { storageObjectsExpected: 3, storageObjectsRemaining: 0, storageCleanupVerified: true } as const;
    expect(verifiedFixtureStorageEvidence(summary)).toEqual(verifiedFixtureStorageEvidence(summary));
  });
});
