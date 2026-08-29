import { describe, expect, it, vi } from "vitest";
import { removeAndVerifyFixtureStorage, verifyExactFixtureStorage } from "@/lib/mascot-generation/fixture-storage-cleanup";

const fixturePaths = [
  "fixture/item-a/normal.png",
  "fixture/item-a/listening.png",
  "fixture/item-a/transcribing.png",
] as const;

describe("fixture storage cleanup", () => {
  it("verifies all three exact fixture objects are gone", async () => {
    const removeExact = vi.fn<(paths: readonly string[]) => Promise<void>>(async () => undefined);
    const objectExistsExact = vi.fn<(path: string) => Promise<boolean>>(async () => false);

    await expect(removeAndVerifyFixtureStorage(fixturePaths, { removeExact, objectExistsExact })).resolves.toEqual({
      storageObjectsExpected: 3,
      storageObjectsRemaining: 0,
      storageCleanupVerified: true,
    });
    expect(removeExact).toHaveBeenCalledWith([...fixturePaths]);
    expect(objectExistsExact.mock.calls.map((args) => args[0] as string)).toEqual([...fixturePaths]);
  });

  it("reports a residual object as a failed cleanup", async () => {
    const result = await removeAndVerifyFixtureStorage(fixturePaths, {
      removeExact: async () => undefined,
      objectExistsExact: async (path) => path === fixturePaths[1],
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
    const objectExistsExact = vi.fn<(path: string) => Promise<boolean>>(async () => false);

    await removeAndVerifyFixtureStorage(registered, { removeExact, objectExistsExact });

    expect(removeExact).toHaveBeenCalledWith([fixturePaths[0], fixturePaths[2]]);
    expect(objectExistsExact.mock.calls.map((args) => args[0] as string)).toEqual([fixturePaths[0], fixturePaths[2]]);
    expect(objectExistsExact).not.toHaveBeenCalledWith(fixturePaths[1]);
  });
});

describe("fixture storage verification", () => {
  it("reports three exact objects as removed when Storage returns 404", async () => {
    const verifyExact = vi.fn<(path: string) => Promise<{ exists: boolean; httpStatus: number | null; errorCode: string | null }>>(async () => ({ exists: false, httpStatus: 404, errorCode: null }));
    const result = await verifyExactFixtureStorage(fixturePaths, { verifyExact });
    expect(result.map(({ result: status }) => status)).toEqual(["not_found", "not_found", "not_found"]);
    expect(result.every((entry) => entry.httpStatus === 404 && entry.safeErrorCode === null)).toBe(true);
    expect(verifyExact.mock.calls.map((args) => args[0] as string)).toEqual([...fixturePaths]);
  });

  it.each([
    [true, 200, null, "exists", null],
    [false, 401, "ignored", "verify_error", "FIXTURE_STORAGE_VERIFY_AUTH_FAILED"],
    [false, 403, "ignored", "verify_error", "FIXTURE_STORAGE_VERIFY_AUTH_FAILED"],
    [false, 503, "ignored", "verify_error", "FIXTURE_STORAGE_VERIFY_BACKEND_FAILED"],
    [false, null, "FIXTURE_STORAGE_VERIFY_SDK_FAILED", "verify_error", "FIXTURE_STORAGE_VERIFY_SDK_FAILED"],
  ] as const)("normalizes status %s", async (exists, httpStatus, errorCode, expectedResult, expectedCode) => {
    const [result] = await verifyExactFixtureStorage([fixturePaths[0]], { verifyExact: async () => ({ exists, httpStatus, errorCode }) });
    expect(result.result).toBe(expectedResult);
    expect(result.safeErrorCode).toBe(expectedCode);
  });

  it("does not consult paths that are not registered", async () => {
    const verifyExact = vi.fn<(path: string) => Promise<{ exists: boolean; httpStatus: number | null; errorCode: string | null }>>(async () => ({ exists: false, httpStatus: 404, errorCode: null }));
    await verifyExactFixtureStorage([fixturePaths[0], fixturePaths[0], fixturePaths[2]], { verifyExact });
    expect(verifyExact.mock.calls.map((args) => args[0] as string)).toEqual([fixturePaths[0], fixturePaths[2]]);
  });
});
