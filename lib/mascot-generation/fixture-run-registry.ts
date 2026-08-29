import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FixtureStorageCleanupResult } from "./fixture-storage-cleanup";
import type { VerifiedFixtureStorageEvidence } from "./fixture-storage-evidence";

const table = "staging_package_fixture_runs";

export type FixtureRunRegistry = {
  operationId: string;
  userId: string;
};

export async function createFixtureRunRegistry(
  admin: SupabaseClient,
  operationId: string,
  userId: string,
  sourceJobId: string,
): Promise<FixtureRunRegistry> {
  const { error } = await admin.from(table).insert({
    operation_id: operationId,
    user_id: userId,
    source_job_id: sourceJobId,
  });
  if (error) throw new Error("FIXTURE_REGISTRY_CREATE_FAILED");
  return { operationId, userId };
}

export async function updateFixtureRunRegistry(
  admin: SupabaseClient,
  registry: FixtureRunRegistry,
  patch: Record<string, unknown>,
) {
  const { error } = await admin.from(table).update({ ...patch, updated_at: new Date().toISOString() })
    .eq("operation_id", registry.operationId)
    .eq("user_id", registry.userId);
  if (error) throw new Error("FIXTURE_REGISTRY_UPDATE_FAILED");
}

export async function markFixtureRunCleanup(
  admin: SupabaseClient,
  registry: FixtureRunRegistry,
  cleanupStatus: "cleaning" | "cleaned" | "failed",
  cleanup?: FixtureStorageCleanupResult,
) {
  await updateFixtureRunRegistry(admin, registry, {
    cleanup_status: cleanupStatus,
    ...(cleanup ? {
      cleanup_counts: {
        storageObjectsExpected: cleanup.storageObjectsExpected,
        storageObjectsRemaining: cleanup.storageObjectsRemaining,
        storageCleanupVerified: cleanup.storageCleanupVerified,
      },
    } : {}),
  });
}

/** Persists a server-derived Storage result without changing the DB cleanup state. */
export async function persistFixtureStorageCleanupEvidence(
  admin: SupabaseClient,
  registry: FixtureRunRegistry,
  evidence: VerifiedFixtureStorageEvidence,
) {
  await updateFixtureRunRegistry(admin, registry, { cleanup_counts: evidence });
}

/** The registry is retained only after a failed cleanup, to permit exact recovery. */
export async function deleteFixtureRunRegistry(admin: SupabaseClient, registry: FixtureRunRegistry) {
  const { error } = await admin.from(table).delete()
    .eq("operation_id", registry.operationId)
    .eq("user_id", registry.userId);
  if (error) throw new Error("FIXTURE_REGISTRY_DELETE_FAILED");
}
