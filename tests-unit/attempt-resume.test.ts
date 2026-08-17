import { describe, expect, it } from "vitest";
import { isResumableAttemptStatus } from "@/lib/mascot-generation/attempt-store";

describe("isResumableAttemptStatus", () => {
  it("não retoma um mascote já guardado ou cancelado", () => {
    expect(isResumableAttemptStatus("ready")).toBe(false);
    expect(isResumableAttemptStatus("canceled")).toBe(false);
  });

  it("retoma trabalhos que ainda exigem continuidade", () => {
    expect(isResumableAttemptStatus("generating_masters")).toBe(true);
    expect(isResumableAttemptStatus("awaiting_master_approval")).toBe(true);
    expect(isResumableAttemptStatus("generating_poses")).toBe(true);
    expect(isResumableAttemptStatus("failed")).toBe(true);
  });
});
