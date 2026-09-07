import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { parseReadyManifest } from "@/lib/mascot-generation/package-store";
import { normalizePackageAsset } from "@/lib/mascot-generation/package-store";

const hash = "a".repeat(64);

function manifest() {
  return {
    schemaVersion: 1,
    assetPipelineVersion: 3,
    packageId: "package-456",
    mascotId: "item-123",
    packageVersion: "1.0.0",
    createdAt: "2026-09-07T12:00:00.000Z",
    publishedAt: "2026-09-07T12:00:01.000Z",
    displayName: "Mascote GRU",
    visibility: "PRIVATE",
    assets: ["NORMAL", "LISTENING", "TRANSCRIBING"].map((role) => ({
      poseId: role.toLowerCase(), role,
      storagePath: `v1/user/package/${role.toLowerCase()}/${hash}.png`,
      sha256: hash, expectedBytes: 12, mimeType: "image/png", width: 24, height: 32,
    })),
  };
}

describe("package manifest v1", () => {
  it("aceita exatamente as três poses do contrato Android", () => {
    expect(parseReadyManifest(manifest())).not.toBeNull();
  });

  it("rejeita uma quarta pose, um papel duplicado e checksum inválido", () => {
    const fourth = manifest();
    fourth.assets.push({ ...fourth.assets[0], poseId: "extra", role: "EXTRA" });
    expect(parseReadyManifest(fourth)).toBeNull();
    const duplicate = manifest();
    duplicate.assets[2] = { ...duplicate.assets[2], role: "NORMAL" };
    expect(parseReadyManifest(duplicate)).toBeNull();
    const corrupt = manifest();
    corrupt.assets[0] = { ...corrupt.assets[0], sha256: "bad" };
    expect(parseReadyManifest(corrupt)).toBeNull();
  });

  it("exige timestamps válidos no contrato V1", () => {
    const missingTimestamp = { ...manifest(), publishedAt: undefined };
    expect(parseReadyManifest(missingTimestamp)).toBeNull();

    const invalidTimestamp = manifest();
    invalidTimestamp.createdAt = "not-a-date";
    expect(parseReadyManifest(invalidTimestamp)).toBeNull();
  });

  it("normaliza o asset com Sharp e recalcula o checksum dos bytes publicados", async () => {
    const source = await sharp({
      create: { width: 8, height: 6, channels: 3, background: "#d9b56d" },
    }).jpeg({ quality: 80 }).toBuffer();

    const result = await normalizePackageAsset(new Uint8Array(source), "image/jpeg");

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(8);
    expect(result.height).toBe(6);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.bytes).not.toEqual(source);
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({ format: "png", width: 8, height: 6 });
  });
});
