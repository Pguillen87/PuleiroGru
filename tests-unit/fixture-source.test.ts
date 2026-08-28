import { describe, expect, it } from "vitest";
import { resolveFixtureSource } from "@/lib/mascot-generation/fixture-source";

describe("fixture source", () => {
  const source = { user_id: "qa-owner", attempt_id: "attempt-real", selected_master_id: "master_1" };

  it("uses only the persisted attempt and approved master owned by QA", () => {
    expect(resolveFixtureSource(source, "qa-owner")).toEqual({ attemptId: "attempt-real", masterId: "master_1" });
  });

  it("refuses another owner, an absent attempt, or an absent master", () => {
    expect(resolveFixtureSource(source, "other-owner")).toBeNull();
    expect(resolveFixtureSource({ ...source, attempt_id: "" }, "qa-owner")).toBeNull();
    expect(resolveFixtureSource({ ...source, selected_master_id: null }, "qa-owner")).toBeNull();
  });
});
