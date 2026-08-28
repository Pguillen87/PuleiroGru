import { describe, expect, it } from "vitest";
import { parseReadyManifest } from "@/lib/mascot-generation/package-store";

const hash = "a".repeat(64);

function manifest() {
  return {
    schemaVersion: 1,
    assetPipelineVersion: 3,
    mascotId: "item-123",
    packageVersion: "1.0.0",
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
});
