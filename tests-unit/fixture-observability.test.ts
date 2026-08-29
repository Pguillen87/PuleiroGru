import { describe, expect, it, vi } from "vitest";
import { FixtureProviderFetchAudit, FixtureStageError, fixtureErrorResponse, fixtureFailure, fixtureProviderFetchSubstages, fixtureStages } from "@/lib/mascot-generation/fixture-observability";

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

  it.each(fixtureProviderFetchSubstages)("records each provider substage without returning provider details", (substage) => {
    const audit = new FixtureProviderFetchAudit("fixture-operation");
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    audit.start(substage);
    audit.succeed({ httpStatus: 200, jobPresent: true, attemptPresent: true, poseCount: 3 });
    expect(log).toHaveBeenCalledWith("staging_package_fixture_provider_fetch", expect.objectContaining({
      substage, operationId: "fixture-operation", httpStatus: 200, poseCount: 3,
    }));
  });

  it("maps provider failures to the closed fixture code", () => {
    const audit = new FixtureProviderFetchAudit("fixture-operation");
    audit.start("PROVIDER_JOB_FETCH");
    expect(audit.fail(Object.assign(new Error("private response"), { status: 401 }))).toEqual(
      new FixtureStageError("FIXTURE_PROVIDER_FETCH", "FIXTURE_PROVIDER_FETCH_FAILED"),
    );
  });
});
