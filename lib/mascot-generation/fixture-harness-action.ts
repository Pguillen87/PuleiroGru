import type { PackageRecoveryStage } from "./package-store";

const checkpoints = new Set<PackageRecoveryStage>(["after_asset_1", "after_assets_3", "after_manifest", "after_code", "before_ready", "after_ready"]);

export type FixtureHarnessAction = PackageRecoveryStage | "inspect_source" | "inspect_previous_cleanup_storage" | "recover_previous_after_asset_1";

/** Deliberately returns an action only; client cleanup evidence is never accepted. */
export function fixtureHarnessAction(value: unknown): FixtureHarnessAction {
  const body = value as { checkpoint?: unknown; action?: unknown } | null;
  if (body?.action === "inspect_source") return "inspect_source";
  if (body?.action === "inspect_previous_cleanup_storage") return "inspect_previous_cleanup_storage";
  if (body?.action === "recover_previous_after_asset_1") return "recover_previous_after_asset_1";
  if (typeof body?.checkpoint !== "string" || !checkpoints.has(body.checkpoint as PackageRecoveryStage)) {
    throw new Error("FIXTURE_CHECKPOINT_INVALID");
  }
  return body.checkpoint as PackageRecoveryStage;
}
