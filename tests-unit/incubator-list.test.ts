import { describe, expect, it } from "vitest";
import { filterIncubations, incubationListLabel } from "@/components/incubator/IncubatorList";
import type { IncubationSummary } from "@/lib/mascot-generation/types";

const base = {
  attemptId: "attempt-1",
  phase: "awaiting_set_approval",
  updatedAt: "2026-09-11T12:00:00.000Z",
  poseCount: 3,
} satisfies Omit<IncubationSummary, "jobId" | "productState">;

const items: IncubationSummary[] = [
  { ...base, jobId: "job-ready", productState: "READY_TO_HATCH" },
  { ...base, jobId: "job-hatched", productState: "HATCHED" },
  { ...base, jobId: "job-running", productState: "INCUBATING" },
  { ...base, jobId: "job-failed", productState: "FAILED" },
];

describe("IncubatorList", () => {
  it("separa os estados de produto sem inventar estado novo", () => {
    expect(filterIncubations(items, "ready").map((item) => item.productState)).toEqual(["READY_TO_HATCH"]);
    expect(filterIncubations(items, "naming").map((item) => item.productState)).toEqual(["HATCHED"]);
    expect(filterIncubations(items, "failed").map((item) => item.productState)).toEqual(["FAILED"]);
    expect(filterIncubations(items, "in-progress").map((item) => item.productState)).toEqual(["INCUBATING"]);
  });

  it("apresenta a linguagem de produto definida para pronto e nomeação", () => {
    expect(incubationListLabel(items[0])).toBe("Pronto para abrir");
    expect(incubationListLabel(items[1])).toBe("Concluir nome");
  });
});
