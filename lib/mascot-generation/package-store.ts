import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { findLibraryItem } from "./library-store";
import { getMascotGenerationProvider } from "./provider";
import { jobIdentity } from "./attempt";
import type { MascotLibraryItem, PoseRole } from "./types";

const BUCKET = "mascot-packages";
const ROLES: PoseRole[] = ["normal", "listening", "transcribing"];

export class MascotPackageError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

type StoredAsset = {
  poseId: string;
  role: Uppercase<PoseRole>;
  storagePath: string;
  sha256: string;
  expectedBytes: number;
  mimeType: string;
  width: number;
  height: number;
};

export async function publishMascotPackage(client: SupabaseClient, userId: string, itemId: string) {
  const admin = createAdminClient();
  if (!admin) throw new MascotPackageError("PACKAGE_STORAGE_UNAVAILABLE", "Armazenamento de pacotes não configurado.");
  const item = await findLibraryItem(client, userId, itemId);
  if (!item) throw new MascotPackageError("MASCOT_NOT_FOUND", "Mascote não encontrado.");
  const existing = await findPackage(admin, userId, item.id);
  if (existing) return { item, package: existing };

  const version = "1.0.0";
  const assets = await downloadAndStoreAssets(admin, userId, item, version);
  const manifest = { schemaVersion: 1, mascotId: item.id, packageVersion: version, displayName: "Mascote do GRU", visibility: "PRIVATE", assets };
  const { data: packageRow, error } = await admin.from("mascot_packages").insert({
    library_item_id: item.id, user_id: userId, package_version: version, manifest, status: "ready",
  }).select("id, package_version, manifest, status").single();
  if (error || !packageRow) throw new MascotPackageError("PACKAGE_REGISTRATION_FAILED", "Não foi possível registrar o pacote.");
  const codeHash = hashCode(item.mascotCode);
  const { error: codeError } = await admin.from("mascot_import_codes").insert({ package_id: packageRow.id, user_id: userId, code_hash: codeHash });
  if (codeError && codeError.code !== "23505") throw new MascotPackageError("IMPORT_CODE_REGISTRATION_FAILED", "Não foi possível registrar o código.");
  return { item, package: packageRow };
}

export async function resolveMascotImportCode(admin: SupabaseClient, code: string) {
  const { data: codeRow, error } = await admin.from("mascot_import_codes")
    .select("package_id, expires_at, revoked_at").eq("code_hash", hashCode(code)).maybeSingle();
  if (error || !codeRow || codeRow.revoked_at || (codeRow.expires_at && new Date(codeRow.expires_at) <= new Date())) return null;
  const { data: packageRow } = await admin.from("mascot_packages")
    .select("id, package_version, manifest, status").eq("id", codeRow.package_id).eq("status", "ready").maybeSingle();
  return packageRow ?? null;
}

async function findPackage(admin: SupabaseClient, userId: string, itemId: string) {
  const { data } = await admin.from("mascot_packages").select("id, package_version, manifest, status")
    .eq("user_id", userId).eq("library_item_id", itemId).maybeSingle();
  return data;
}

async function downloadAndStoreAssets(admin: SupabaseClient, userId: string, item: MascotLibraryItem, version: string): Promise<StoredAsset[]> {
  const provider = getMascotGenerationProvider();
  const identity = jobIdentity(userId, item.attemptId);
  const assets: StoredAsset[] = [];
  for (const role of ROLES) {
    const source = await provider.getPoseImage?.(item.jobId, role, identity);
    if (!source) throw new MascotPackageError("POSE_ASSET_NOT_FOUND", `A pose ${role} não está disponível.`);
    const normalized = await sharp(source.bytes).rotate().toBuffer({ resolveWithObject: true });
    const hash = createHash("sha256").update(normalized.data).digest("hex");
    const metadata = await sharp(normalized.data).metadata();
    const extension = source.contentType === "image/png" ? "png" : source.contentType === "image/webp" ? "webp" : "jpg";
    const storagePath = `${userId}/${item.id}/${version}/${role}.${extension}`;
    const upload = await admin.storage.from(BUCKET).upload(storagePath, normalized.data, { contentType: source.contentType, upsert: false });
    if (upload.error && !upload.error.message.toLowerCase().includes("already exists")) throw new MascotPackageError("PACKAGE_ASSET_UPLOAD_FAILED", "Não foi possível guardar um asset.");
    assets.push({ poseId: `${item.id}-${role}`, role: role.toUpperCase() as Uppercase<PoseRole>, storagePath, sha256: hash, expectedBytes: normalized.data.length, mimeType: source.contentType, width: metadata.width ?? 0, height: metadata.height ?? 0 });
  }
  return assets;
}

function hashCode(code: string) { return createHash("sha256").update(code.trim().toUpperCase()).digest("hex"); }
