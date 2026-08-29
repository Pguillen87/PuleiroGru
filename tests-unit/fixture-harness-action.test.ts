import { describe, expect, it } from "vitest";
import { fixtureHarnessAction } from "@/lib/mascot-generation/fixture-harness-action";

describe("fixture harness request contract", () => {
  it("accepts only the requested action and ignores client-supplied cleanup evidence", () => {
    expect(fixtureHarnessAction({
      action: "inspect_previous_cleanup_storage",
      storageCleanupVerified: true,
      storageObjectsRemaining: 0,
    })).toBe("inspect_previous_cleanup_storage");
  });

  it("rejects a request without a valid action or checkpoint", () => {
    expect(() => fixtureHarnessAction({ storageCleanupVerified: true })).toThrow("FIXTURE_CHECKPOINT_INVALID");
  });
});
