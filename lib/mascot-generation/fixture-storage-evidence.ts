import type { FixtureStorageVerificationSummary } from "./fixture-storage-cleanup";

export type VerifiedFixtureStorageEvidence = {
  storageObjectsExpected: 3;
  storageObjectsRemaining: 0;
  storageCleanupVerified: true;
};

/** Only accepts the exact server-computed result for this three-asset fixture. */
export function verifiedFixtureStorageEvidence(
  summary: FixtureStorageVerificationSummary,
): VerifiedFixtureStorageEvidence {
  if (summary.storageObjectsExpected !== 3 || summary.storageObjectsRemaining !== 0 || summary.storageCleanupVerified !== true) {
    throw new Error("FIXTURE_STORAGE_CLEANUP_UNVERIFIED");
  }
  return {
    storageObjectsExpected: 3,
    storageObjectsRemaining: 0,
    storageCleanupVerified: true,
  };
}
