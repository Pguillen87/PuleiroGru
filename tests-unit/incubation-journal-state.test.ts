import { describe, expect, it } from "vitest";
import { shouldPollIncubation } from "@/components/incubator/IncubationJournal";

describe("IncubationJournal polling", () => {
  it("polls only while the birth is still processing", () => {
    expect(shouldPollIncubation("PREPARING")).toBe(true);
    expect(shouldPollIncubation("INCUBATING")).toBe(true);
    expect(shouldPollIncubation("NEEDS_HUMAN_MASTER_SELECTION")).toBe(false);
    expect(shouldPollIncubation("READY_TO_HATCH")).toBe(false);
    expect(shouldPollIncubation("FAILED")).toBe(false);
    expect(shouldPollIncubation("HATCHED")).toBe(false);
  });
});
