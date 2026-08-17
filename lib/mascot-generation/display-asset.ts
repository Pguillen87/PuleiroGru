import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { MasterImage } from "./types";

const TECHNICAL_BORDER_THRESHOLD = 0.55;
const MIN_TECHNICAL_CHANNEL = 145;
const MAX_CHANNEL_SPREAD = 34;
const MAX_CACHE_ENTRIES = 64;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const displayAssetCache = new Map<string, MasterImage>();
const pendingAssets = new Map<string, Promise<MasterImage>>();
let displayAssetCacheBytes = 0;

export type DisplayAssetVariant = "full" | "thumbnail";

export async function prepareMascotDisplayAsset(image: MasterImage, variant: DisplayAssetVariant = "full"): Promise<MasterImage> {
  const cacheKey = `${variant}:${createHash("sha256").update(image.bytes).digest("hex")}`;
  const cached = displayAssetCache.get(cacheKey);
  if (cached) {
    displayAssetCache.delete(cacheKey);
    displayAssetCache.set(cacheKey, cached);
    return cached;
  }
  const pending = pendingAssets.get(cacheKey);
  if (pending) return pending;
  const preparation = buildDisplayAsset(image, variant).then((asset) => {
    const previous = displayAssetCache.get(cacheKey);
    if (previous) displayAssetCacheBytes -= previous.bytes.byteLength;
    displayAssetCache.set(cacheKey, asset);
    displayAssetCacheBytes += asset.bytes.byteLength;
    while (displayAssetCache.size > MAX_CACHE_ENTRIES || displayAssetCacheBytes > MAX_CACHE_BYTES) {
      const oldest = displayAssetCache.keys().next().value;
      if (oldest) {
        const removed = displayAssetCache.get(oldest);
        if (removed) displayAssetCacheBytes -= removed.bytes.byteLength;
        displayAssetCache.delete(oldest);
      }
      else break;
    }
    return asset;
  }).finally(() => pendingAssets.delete(cacheKey));
  pendingAssets.set(cacheKey, preparation);
  return preparation;
}

async function buildDisplayAsset(image: MasterImage, variant: DisplayAssetVariant): Promise<MasterImage> {
  const decoded = await sharp(image.bytes, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  const hasTechnicalBackground = channels === 4 && hasTechnicalBorder(decoded.data, width, height);
  if (!hasTechnicalBackground && variant === "full") return image;

  const normalized = hasTechnicalBackground
    ? sharp(removeConnectedTechnicalBackground(decoded.data, width, height), { raw: { width, height, channels: 4 } })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : sharp(image.bytes, { failOn: "error" });
  if (variant === "thumbnail") {
    const bytes = await normalized
      .resize({ width: 320, height: 400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90, effort: 4 })
      .toBuffer();
    return { bytes: new Uint8Array(bytes), contentType: "image/webp" };
  }
  const bytes = await normalized.png({ compressionLevel: 9 }).toBuffer();
  return { bytes: new Uint8Array(bytes), contentType: "image/png" };
}

function hasTechnicalBorder(data: Buffer, width: number, height: number) {
  let technical = 0;
  let inspected = 0;
  for (let x = 0; x < width; x += 1) {
    technical += Number(isTechnicalPixel(data, pixelOffset(x, 0, width)));
    technical += Number(isTechnicalPixel(data, pixelOffset(x, height - 1, width)));
    inspected += 2;
  }
  for (let y = 1; y < height - 1; y += 1) {
    technical += Number(isTechnicalPixel(data, pixelOffset(0, y, width)));
    technical += Number(isTechnicalPixel(data, pixelOffset(width - 1, y, width)));
    inspected += 2;
  }
  return inspected > 0 && technical / inspected >= TECHNICAL_BORDER_THRESHOLD;
}

function removeConnectedTechnicalBackground(source: Buffer, width: number, height: number) {
  const output = Buffer.from(source);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (x: number, y: number) => {
    const pixel = y * width + x;
    if (visited[pixel] || !isTechnicalPixel(output, pixel * 4)) return;
    visited[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const offset = pixel * 4;
    output[offset] = 0;
    output[offset + 1] = 0;
    output[offset + 2] = 0;
    output[offset + 3] = 0;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }
  return output;
}

function isTechnicalPixel(data: Buffer, offset: number) {
  if (data[offset + 3] === 0) return true;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return Math.min(red, green, blue) >= MIN_TECHNICAL_CHANNEL
    && Math.max(red, green, blue) - Math.min(red, green, blue) <= MAX_CHANNEL_SPREAD;
}

function pixelOffset(x: number, y: number, width: number) {
  return (y * width + x) * 4;
}
