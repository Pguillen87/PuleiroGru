import { describe, expect, it } from "vitest";
import { countFixtureSourceRoles, resolveFixtureSource, resolveProviderFixtureSource } from "@/lib/mascot-generation/fixture-source";

describe("fixture source", () => {
  const source = { user_id: "qa-owner", attempt_id: "attempt-real", selected_master_id: "master_1" };
  const sourceJobId = "job-approved-source";

  it("uses only the persisted attempt and approved master owned by QA", () => {
    expect(resolveFixtureSource(source, "qa-owner", sourceJobId)).toEqual({
      jobId: sourceJobId, attemptId: "attempt-real", masterId: "master_1",
    });
  });

  it("refuses another owner, an absent attempt, or an absent master", () => {
    expect(resolveFixtureSource(source, "other-owner", sourceJobId)).toBeNull();
    expect(resolveFixtureSource({ ...source, attempt_id: "" }, "qa-owner", sourceJobId)).toBeNull();
    expect(resolveFixtureSource({ ...source, selected_master_id: null }, "qa-owner", sourceJobId)).toBeNull();
    expect(resolveFixtureSource(source, "qa-owner", "")).toBeNull();
  });

  it("accepts only the exact three provider roles", () => {
    const roles = ["normal", "listening", "transcribing"] as const;
    expect(countFixtureSourceRoles(roles.map((role) => ({ role })), roles)).toBe(3);
    expect(countFixtureSourceRoles([{ role: "normal" }, { role: "normal" }, { role: "transcribing" }], roles)).toBe(1);
  });

  it("uses Modal's server-returned attempt without accepting a different job or incomplete response", () => {
    const binding = resolveFixtureSource(source, "qa-owner", sourceJobId)!;
    expect(resolveProviderFixtureSource(binding, {
      id: sourceJobId, attemptId: "attempt-modal-real", approvedMasterId: "master-modal-real",
    })).toEqual({ jobId: sourceJobId, attemptId: "attempt-modal-real", masterId: "master-modal-real" });
    expect(resolveProviderFixtureSource(binding, { id: "job-other", attemptId: "attempt-modal-real", approvedMasterId: "master-modal-real" })).toBeNull();
    expect(resolveProviderFixtureSource(binding, { id: sourceJobId, attemptId: "", approvedMasterId: "master-modal-real" })).toBeNull();
    expect(resolveProviderFixtureSource(binding, { id: sourceJobId, attemptId: "attempt-modal-real" })).toBeNull();
  });
});
