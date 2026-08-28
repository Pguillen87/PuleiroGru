export type FixtureSourceAttempt = {
  user_id: string;
  attempt_id: string;
  selected_master_id: string | null;
};

export type FixtureSource = {
  attemptId: string;
  masterId: string;
};

/** Turns the QA attempt record into a read-only fixture source. */
export function resolveFixtureSource(row: FixtureSourceAttempt | null, expectedOwnerId: string): FixtureSource | null {
  if (!row || row.user_id !== expectedOwnerId || !row.attempt_id || !row.selected_master_id) return null;
  return { attemptId: row.attempt_id, masterId: row.selected_master_id };
}
