import { describe, expect, it } from "vitest";
import { inspectPoseQc, shortHash } from "@/lib/mascot-generation/fixture-source-inspection";

describe("fixture source inspection", () => {
  it("derives visual metrics without returning image data", () => {
    const result = inspectPoseQc({ status: "passed", width: 100, height: 200, bounding_box: [20, 10, 80, 190], internal_background_components: 0 });
    expect(result.metrics).toMatchObject({ relativeWidth: 0.6, relativeHeight: 0.9, footBase: 0.95 });
    expect(result.internalBackgroundComponents).toBe(0);
  });
  it("only exposes abbreviated valid SHA-256 values", () => {
    expect(shortHash("a".repeat(64))).toBe("a".repeat(12));
    expect(shortHash("not-a-hash")).toBeNull();
  });
});
