import { describe, expect, it, vi } from "vitest";
import { removeAndVerifyFixtureStorage } from "@/lib/mascot-generation/fixture-storage-cleanup";

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
