import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { MasterImage } from "./types";

const TECHNICAL_BORDER_THRESHOLD = 0.55;
const MIN_TECHNICAL_CHANNEL = 145;
const MAX_CHANNEL_SPREAD = 34;
const FLAT_BACKGROUND_THRESHOLD = 0.82;
const FLAT_BACKGROUND_TOLERANCE = 24;
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 400;
// Keep the library card compact while giving the mascot a clear, consistent
// optical footprint across subjects with different original dimensions.
const THUMBNAIL_SUBJECT_WIDTH = 220;
const THUMBNAIL_SUBJECT_HEIGHT = 300;
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
  const flatBackground = !hasTechnicalBackground ? findFlatBorderColor(decoded.data, width, height) : null;

  const normalized = hasTechnicalBackground || flatBackground
    ? sharp(removeConnectedBackground(decoded.data, width, height, (data, offset) => hasTechnicalBackground
      ? isTechnicalPixel(data, offset)
      : isFlatBackgroundPixel(data, offset, flatBackground!)), { raw: { width, height, channels: 4 } })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : sharp(image.bytes, { failOn: "error" });
  if (variant === "thumbnail") {
    const subject = await normalized
      .resize({ width: THUMBNAIL_SUBJECT_WIDTH, height: THUMBNAIL_SUBJECT_HEIGHT, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
    const bytes = await sharp({
      create: { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: subject, gravity: "center" }])
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

function removeConnectedBackground(source: Buffer, width: number, height: number, isBackgroundPixel: (data: Buffer, offset: number) => boolean) {
  const output = Buffer.from(source);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (x: number, y: number) => {
    const pixel = y * width + x;
    if (visited[pixel] || !isBackgroundPixel(output, pixel * 4)) return;
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

function findFlatBorderColor(data: Buffer, width: number, height: number) {
  const samples: Array<[number, number, number]> = [];
  const collect = (x: number, y: number) => {
    const offset = pixelOffset(x, y, width);
    if (data[offset + 3] < 245) return;
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };
  for (let x = 0; x < width; x += 1) {
    collect(x, 0);
    collect(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    collect(0, y);
    collect(width - 1, y);
  }
  if (samples.length === 0) return null;
  const color = samples.reduce((total, sample) => [total[0] + sample[0], total[1] + sample[1], total[2] + sample[2]], [0, 0, 0] as [number, number, number])
    .map((channel) => Math.round(channel / samples.length)) as [number, number, number];
  const matching = samples.filter(([red, green, blue]) => Math.max(Math.abs(red - color[0]), Math.abs(green - color[1]), Math.abs(blue - color[2])) <= FLAT_BACKGROUND_TOLERANCE).length;
  return matching / samples.length >= FLAT_BACKGROUND_THRESHOLD ? color : null;
}

function isFlatBackgroundPixel(data: Buffer, offset: number, color: [number, number, number]) {
  if (data[offset + 3] === 0) return true;
  return Math.max(
    Math.abs(data[offset] - color[0]),
    Math.abs(data[offset + 1] - color[1]),
    Math.abs(data[offset + 2] - color[2]),
  ) <= FLAT_BACKGROUND_TOLERANCE;
}

function isTechnicalPixel(data: Buffer, offset: number) {
  // Transparent edges are valid output from the Modal post-processor. They are
  // not the opaque checkerboard background this normalizer removes.
  if (data[offset + 3] === 0) return false;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return Math.min(red, green, blue) >= MIN_TECHNICAL_CHANNEL
    && Math.max(red, green, blue) - Math.min(red, green, blue) <= MAX_CHANNEL_SPREAD;
}

function pixelOffset(x: number, y: number, width: number) {
  return (y * width + x) * 4;
}
