import type { PoseRole } from "./types";

export type FixtureSourceAttempt = {
  user_id: string;
  attempt_id: string;
  selected_master_id: string | null;
};

export type FixtureSource = {
  jobId: string;
  attemptId: string;
  masterId: string;
};

export type FixtureProviderSource = {
  id: string;
  attemptId: string;
  approvedMasterId?: string;
};

/** Turns the QA attempt record into a read-only fixture source. */
export function resolveFixtureSource(
  row: FixtureSourceAttempt | null,
  expectedOwnerId: string,
  sourceJobId: string,
): FixtureSource | null {
  if (!row || row.user_id !== expectedOwnerId || !row.attempt_id || !row.selected_master_id || !sourceJobId) return null;
  return { jobId: sourceJobId, attemptId: row.attempt_id, masterId: row.selected_master_id };
}

/** Rebinds the read-only fixture to the attempt and approved master returned by Modal. */
export function resolveProviderFixtureSource(source: FixtureSource, job: FixtureProviderSource): FixtureSource | null {
  if (job.id !== source.jobId || !job.attemptId || !job.approvedMasterId) return null;
  return { ...source, attemptId: job.attemptId, masterId: job.approvedMasterId };
}

/** Rejects incomplete or duplicated source responses before a fixture item exists. */
export function countFixtureSourceRoles(poses: Array<{ role: PoseRole }>, expectedRoles: readonly PoseRole[]) {
  return expectedRoles.filter((role) => poses.filter((pose) => pose.role === role).length === 1).length;
}
