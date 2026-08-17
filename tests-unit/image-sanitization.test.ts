import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { validateAndSanitizeImage } from "@/lib/mascot-generation/validation";

describe("validateAndSanitizeImage", () => {
  it("aplica orientação e remove EXIF antes do envio", async () => {
    const input = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#d9b56d" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const file = new File([input], "foto.jpg", { type: "image/jpeg" });
    const result = await validateAndSanitizeImage(file, 2 * 1024 * 1024);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect([metadata.width, metadata.height]).toEqual([400, 300]);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejeita MIME declarado diferente do conteúdo", async () => {
    const bytes = await sharp({ create: { width: 300, height: 300, channels: 3, background: "red" } }).png().toBuffer();
    const file = new File([bytes], "foto.jpg", { type: "image/jpeg" });
    await expect(validateAndSanitizeImage(file, 2 * 1024 * 1024)).rejects.toMatchObject({ code: "IMAGE_FORMAT_MISMATCH" });
  });

  it("rejeita uma foto pequena antes de tentar criar o job", async () => {
    const bytes = await sharp({ create: { width: 255, height: 300, channels: 3, background: "red" } }).jpeg().toBuffer();
    const file = new File([bytes], "pequena.jpg", { type: "image/jpeg" });
    await expect(validateAndSanitizeImage(file, 2 * 1024 * 1024)).rejects.toMatchObject({ code: "IMAGE_TOO_SMALL" });
  });
});
