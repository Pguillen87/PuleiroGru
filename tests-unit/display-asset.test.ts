import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareMascotDisplayAsset } from "@/lib/mascot-generation/display-asset";

describe("prepareMascotDisplayAsset", () => {
  it("remove um quadriculado técnico conectado às bordas", async () => {
    const background = await checkerboard(160, 160);
    const source = await sharp(background, { raw: { width: 160, height: 160, channels: 4 } })
      .composite([{ input: Buffer.from('<svg width="72" height="104" xmlns="http://www.w3.org/2000/svg"><ellipse cx="36" cy="52" rx="30" ry="46" fill="#c91f37" stroke="#171310" stroke-width="6"/></svg>'), left: 44, top: 28 }])
      .png()
      .toBuffer();

    const result = await prepareMascotDisplayAsset({ bytes: new Uint8Array(source), contentType: "image/png" });
    const decoded = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(result.contentType).toBe("image/png");
    expect(decoded.info.width).toBeLessThan(160);
    expect(decoded.data[3]).toBe(0);
    const centerAlpha = decoded.data[((Math.floor(decoded.info.height / 2) * decoded.info.width + Math.floor(decoded.info.width / 2)) * 4) + 3];
    expect(centerAlpha).toBe(255);
  });

  it("mantém intacta uma ilustração com fundo editorial real", async () => {
    const source = await sharp({ create: { width: 100, height: 80, channels: 3, background: "#342019" } }).jpeg().toBuffer();
    const result = await prepareMascotDisplayAsset({ bytes: new Uint8Array(source), contentType: "image/jpeg" });
    expect(result.contentType).toBe("image/jpeg");
    expect(Buffer.from(result.bytes)).toEqual(source);
  });

  it("gera uma miniatura WebP limitada para a biblioteca", async () => {
    const source = await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: "#efe1bd" },
    }).composite([{
      input: Buffer.from('<svg width="440" height="860" xmlns="http://www.w3.org/2000/svg"><ellipse cx="220" cy="430" rx="180" ry="390" fill="#c91f37"/></svg>'),
      left: 380,
      top: 370,
    }]).png().toBuffer();

    const result = await prepareMascotDisplayAsset(
      { bytes: new Uint8Array(source), contentType: "image/png" },
      "thumbnail",
    );
    const metadata = await sharp(result.bytes).metadata();

    expect(result.contentType).toBe("image/webp");
    expect(metadata.width).toBeLessThanOrEqual(320);
    expect(metadata.height).toBeLessThanOrEqual(400);
    expect(result.bytes.byteLength).toBeLessThan(source.byteLength);
    const decoded = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info.width).toBe(320);
    expect(decoded.info.height).toBe(400);
    expect(decoded.data[3]).toBe(0);
    const centerAlpha = decoded.data[((200 * 320 + 160) * 4) + 3];
    expect(centerAlpha).toBe(255);
    const bounds = alphaBounds(decoded.data, 320, 400);
    expect(bounds.width).toBeLessThanOrEqual(144);
    expect(bounds.height).toBeLessThanOrEqual(192);
  });
});

function alphaBounds(data: Buffer, width: number, height: number) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { width: right - left + 1, height: bottom - top + 1 };
}

function checkerboard(width: number, height: number) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shade = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 244 : 204;
      const offset = (y * width + x) * 4;
      data[offset] = shade;
      data[offset + 1] = shade;
      data[offset + 2] = shade;
      data[offset + 3] = 255;
    }
  }
  return data;
}
