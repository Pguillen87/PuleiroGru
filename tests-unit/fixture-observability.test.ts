import { describe, expect, it } from "vitest";
import { FixtureStageError, fixtureErrorResponse, fixtureFailure, fixtureStages } from "@/lib/mascot-generation/fixture-observability";

describe("fixture observability", () => {
  it.each(fixtureStages)("maps unknown errors to a safe error for %s", (stage) => {
    const failure = fixtureFailure(stage, new Error("secret=https://private.example/signed-url"));
    expect(failure).toBeInstanceOf(FixtureStageError);
    expect(failure.stage).toBe(stage);
    expect(failure.safeErrorCode).toBe(`${stage}_FAILED`);
    expect(failure.safeErrorCode).not.toContain("secret");
  });

  it("returns only the stage and safe code to the client", () => {
    expect(fixtureErrorResponse(new FixtureStageError("FIXTURE_STORAGE_WRITE"), "FIXTURE_ITEM_CREATE")).toEqual({
      stage: "FIXTURE_STORAGE_WRITE",
      safeErrorCode: "FIXTURE_STORAGE_WRITE_FAILED",
    });
  });

  it("does not collapse an unknown error into a phase-less fixture error", () => {
    expect(fixtureErrorResponse(new Error("raw provider response"), "FIXTURE_PROVIDER_FETCH")).toEqual({
      stage: "FIXTURE_PROVIDER_FETCH",
      safeErrorCode: "FIXTURE_PROVIDER_FETCH_FAILED",
    });
  });

  it("keeps provider codes server-side while returning only the phase code", () => {
    const error = Object.assign(new Error("upstream body"), { code: "MODAL_REQUEST_FAILED" });
    expect(fixtureErrorResponse(error, "FIXTURE_PROVIDER_FETCH")).toEqual({
      stage: "FIXTURE_PROVIDER_FETCH",
      safeErrorCode: "FIXTURE_PROVIDER_FETCH_FAILED",
    });
  });
});
