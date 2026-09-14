import { describe, expect, it } from "vitest";
import { formatIncubationDate, incubationProgress } from "@/lib/mascot-generation/incubation-progress";
import type { IncubationSummary } from "@/lib/mascot-generation/types";

const item: IncubationSummary = { attemptId: "test", jobId: "job", productState: "INCUBATING", phase: "generating_masters", createdAt: "2026-09-13T14:46:00Z", updatedAt: "2026-09-13T14:48:00Z", poseCount: 0 };
describe("incubation estimates and timestamps", () => {
  it("uses the original timestamp and explicit Brazilian timezone", () => {
    expect(formatIncubationDate(item.createdAt)).toContain("13/09/2026");
    expect(formatIncubationDate(item.createdAt)).toContain("11:46:00");
    expect(formatIncubationDate("invalid")).toBe("Data não disponível");
  });
  it("does not invent an ETA without enough complete samples", () => {
    expect(incubationProgress(item, { averageMs: 300_000, sampleCount: 2 }, Date.now())?.percent).toBeNull();
  });
  it("calculates remaining time from the mean and never claims completion", () => {
    const timing = { averageMs: 600_000, sampleCount: 20 };
    expect(incubationProgress(item, timing, Date.parse(item.createdAt!) + 300_000)).toMatchObject({ percent: 50, message: "Estimativa: cerca de 5 min restantes." });
    expect(incubationProgress(item, timing, Date.parse(item.createdAt!) + 900_000)).toMatchObject({ percent: 95, message: "Está levando mais tempo que a média. Acompanhe a etapa atual." });
  });
  it("only server-confirmed readiness finishes progress; failure stops it", () => {
    expect(incubationProgress({ ...item, productState: "READY_TO_HATCH" }, { averageMs: null, sampleCount: 0 }, 0)?.percent).toBe(100);
    expect(incubationProgress({ ...item, productState: "FAILED" }, { averageMs: 600_000, sampleCount: 20 }, Date.now())).toBeNull();
    expect(incubationProgress({ ...item, productState: "RECOVERY_REQUIRED" }, { averageMs: 600_000, sampleCount: 20 }, Date.now())).toBeNull();
  });
});
