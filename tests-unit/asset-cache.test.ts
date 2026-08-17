import { describe, expect, it } from "vitest";
import { getCachedMascotAsset } from "@/lib/mascot-generation/asset-cache";

describe("getCachedMascotAsset", () => {
  it("reutiliza a mesma leitura de uma pose no servidor", async () => {
    const key = `test-${crypto.randomUUID()}`;
    let calls = 0;
    const load = async () => {
      calls += 1;
      return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" as const };
    };

    const [first, second] = await Promise.all([
      getCachedMascotAsset(key, load),
      getCachedMascotAsset(key, load),
    ]);
    const third = await getCachedMascotAsset(key, load);

    expect(calls).toBe(1);
    expect(first).toBe(third);
    expect(second).toBe(third);
  });
});
