import { describe, expect, it, vi } from "vitest";
import { removeAndVerifyFixtureStorage, summarizeFixtureStorageVerification, verifyExactFixtureStorage } from "@/lib/mascot-generation/fixture-storage-cleanup";

const fixturePaths = [
  "fixture/item-a/normal.png",
  "fixture/item-a/listening.png",
  "fixture/item-a/transcribing.png",
] as const;

describe("fixture storage cleanup", () => {
  it("verifies all three exact fixture objects are gone", async () => {
    const removeExact = vi.fn<(paths: readonly string[]) => Promise<void>>(async () => undefined);
    const verifyExact = vi.fn<(path: string) => Promise<{ exists: boolean; httpStatus: number | null; errorCode: string | null }>>(async () => ({ exists: false, httpStatus: 400, errorCode: null }));

    await expect(removeAndVerifyFixtureStorage(fixturePaths, { removeExact, verifyExact })).resolves.toEqual({
      storageObjectsExpected: 3,
      storageObjectsRemaining: 0,
      storageCleanupVerified: true,
    });
    expect(removeExact).toHaveBeenCalledWith([...fixturePaths]);
    expect(verifyExact.mock.calls.map((args) => args[0] as string)).toEqual([...fixturePaths]);
  });

  it("reports a residual object as a failed cleanup", async () => {
    const result = await removeAndVerifyFixtureStorage(fixturePaths, {
      removeExact: async () => undefined,
      verifyExact: async (path) => ({ exists: path === fixturePaths[1], httpStatus: path === fixturePaths[1] ? 200 : 404, errorCode: null }),
    });

    expect(result).toEqual({
      storageObjectsExpected: 3,
      storageObjectsRemaining: 1,
      storageCleanupVerified: false,
    });
  });

  it("never removes or verifies an unregistered path", async () => {
    const registered = [fixturePaths[0], fixturePaths[0], fixturePaths[2]];
    const removeExact = vi.fn<(paths: readonly string[]) => Promise<void>>(async () => undefined);
    const verifyExact = vi.fn<(path: string) => Promise<{ exists: boolean; httpStatus: number | null; errorCode: string | null }>>(async () => ({ exists: false, httpStatus: 404, errorCode: null }));

    await removeAndVerifyFixtureStorage(registered, { removeExact, verifyExact });

    expect(removeExact).toHaveBeenCalledWith([fixturePaths[0], fixturePaths[2]]);
    expect(verifyExact.mock.calls.map((args) => args[0] as string)).toEqual([fixturePaths[0], fixturePaths[2]]);
    expect(verifyExact).not.toHaveBeenCalledWith(fixturePaths[1]);
  });
});

describe("fixture storage verification", () => {
  it("treats an exact Storage info 404 as a successfully removed object", async () => {
    const verifyExact = vi.fn<(path: string) => Promise<{ exists: boolean; httpStatus: number | null; errorCode: string | null }>>(async () => ({ exists: false, httpStatus: 404, errorCode: null }));
    const result = await verifyExactFixtureStorage(fixturePaths, { verifyExact });
    expect(result.map(({ result: status }) => status)).toEqual(["not_found", "not_found", "not_found"]);
    expect(result.every((entry) => entry.httpStatus === 404 && entry.safeErrorCode === null)).toBe(true);
    expect(verifyExact.mock.calls.map((args) => args[0] as string)).toEqual([...fixturePaths]);
  });

  it.each([
    [true, 200, null, "exists", null],
    [false, 400, null, "not_found", null],
    [false, 404, null, "not_found", null],
    [false, 401, "ignored", "verify_error", "FIXTURE_STORAGE_VERIFY_AUTH_FAILED"],
    [false, 403, "ignored", "verify_error", "FIXTURE_STORAGE_VERIFY_AUTH_FAILED"],
    [false, 503, "ignored", "verify_error", "FIXTURE_STORAGE_VERIFY_BACKEND_FAILED"],
    [false, null, "FIXTURE_STORAGE_VERIFY_SDK_FAILED", "verify_error", "FIXTURE_STORAGE_VERIFY_SDK_FAILED"],
  ] as const)("normalizes exact Storage exists status %s", async (exists, httpStatus, errorCode, expectedResult, expectedCode) => {
    const [result] = await verifyExactFixtureStorage([fixturePaths[0]], { verifyExact: async () => ({ exists, httpStatus, errorCode }) });
    expect(result.result).toBe(expectedResult);
    expect(result.safeErrorCode).toBe(expectedCode);
  });

  it("consults Storage exists only for registered exact paths", async () => {
    const verifyExact = vi.fn<(path: string) => Promise<{ exists: boolean; httpStatus: number | null; errorCode: string | null }>>(async () => ({ exists: false, httpStatus: 404, errorCode: null }));
    await verifyExactFixtureStorage([fixturePaths[0], fixturePaths[0], fixturePaths[2]], { verifyExact });
    expect(verifyExact.mock.calls.map((args) => args[0] as string)).toEqual([fixturePaths[0], fixturePaths[2]]);
  });

  it("turns an SDK exception into a safe verification error", async () => {
    const [result] = await verifyExactFixtureStorage([fixturePaths[0]], { verifyExact: async () => { throw new Error("unexpected"); } });
    expect(result).toMatchObject({ result: "verify_error", safeErrorCode: "FIXTURE_STORAGE_VERIFY_SDK_FAILED" });
  });

  it("marks cleanup as verified only when all exact objects are not found", async () => {
    const results = await verifyExactFixtureStorage(fixturePaths, { verifyExact: async () => ({ exists: false, httpStatus: 400, errorCode: null }) });
    expect(summarizeFixtureStorageVerification(results)).toEqual({ storageObjectsExpected: 3, storageObjectsRemaining: 0, storageCleanupVerified: true });
  });

  it.each([
    [401, "FIXTURE_STORAGE_VERIFY_AUTH_FAILED"],
    [403, "FIXTURE_STORAGE_VERIFY_AUTH_FAILED"],
    [503, "FIXTURE_STORAGE_VERIFY_BACKEND_FAILED"],
  ])("fails normal cleanup for a real Storage error %s", async (httpStatus, code) => {
    await expect(removeAndVerifyFixtureStorage([fixturePaths[0]], {
      removeExact: async () => undefined,
      verifyExact: async () => ({ exists: false, httpStatus, errorCode: "ignored" }),
    })).resolves.toEqual({ storageObjectsExpected: 1, storageObjectsRemaining: 0, storageCleanupVerified: false });
    const [result] = await verifyExactFixtureStorage([fixturePaths[0]], { verifyExact: async () => ({ exists: false, httpStatus, errorCode: "ignored" }) });
    expect(result.safeErrorCode).toBe(code);
  });
});
