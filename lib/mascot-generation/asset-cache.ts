import "server-only";
import type { MasterImage } from "./types";

const MAX_ENTRIES = 48;
const MAX_BYTES = 48 * 1024 * 1024;
const assets = new Map<string, MasterImage>();
const pending = new Map<string, Promise<MasterImage | null>>();
let cachedBytes = 0;

export async function getCachedMascotAsset(key: string, load: () => Promise<MasterImage | null>) {
  const cached = assets.get(key);
  if (cached) {
    assets.delete(key);
    assets.set(key, cached);
    return cached;
  }
  const existing = pending.get(key);
  if (existing) return existing;

  const request = load().then((asset) => {
    if (asset) saveAsset(key, asset);
    return asset;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

function saveAsset(key: string, asset: MasterImage) {
  const previous = assets.get(key);
  if (previous) cachedBytes -= previous.bytes.byteLength;
  assets.set(key, asset);
  cachedBytes += asset.bytes.byteLength;
  while (assets.size > MAX_ENTRIES || cachedBytes > MAX_BYTES) {
    const oldestKey = assets.keys().next().value;
    if (!oldestKey) return;
    const oldest = assets.get(oldestKey);
    if (oldest) cachedBytes -= oldest.bytes.byteLength;
    assets.delete(oldestKey);
  }
}
