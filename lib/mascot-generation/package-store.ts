import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { findLibraryItem } from "./library-store";
import { getMascotGenerationProvider } from "./provider";
import { jobIdentity } from "./attempt";
import { prepareMascotDisplayAsset } from "./display-asset";
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
  if (existing && packageMatchesCurrentOutput(existing, item.displayName)) return { item, package: existing };

  const version = nextPackageVersion(existing?.package_version);
  const assets = await downloadAndStoreAssets(admin, userId, item, version);
  const manifest = { schemaVersion: 1, assetPipelineVersion: 2, mascotId: item.id, packageVersion: version, displayName: item.displayName, visibility: "PRIVATE", assets };
  if (existing) {
    const { data: refreshed, error } = await admin.from("mascot_packages")
      .update({ package_version: version, manifest, status: "ready" })
      .eq("id", existing.id).eq("user_id", userId)
      .select("id, package_version, manifest, status").single();
    if (error || !refreshed) throw new MascotPackageError("PACKAGE_REGISTRATION_FAILED", "Não foi possível atualizar o pacote.");
    return { item, package: refreshed };
  }
  const { data: packageRow, error } = await admin.from("mascot_packages").insert({
    library_item_id: item.id, user_id: userId, package_version: version, manifest, status: "ready",
  }).select("id, package_version, manifest, status").single();
  if (error || !packageRow) throw new MascotPackageError("PACKAGE_REGISTRATION_FAILED", "Não foi possível registrar o pacote.");
  const codeHash = hashCode(item.mascotCode);
  const { error: codeError } = await admin.from("mascot_import_codes").insert({ package_id: packageRow.id, user_id: userId, code_hash: codeHash });
  if (codeError && codeError.code !== "23505") throw new MascotPackageError("IMPORT_CODE_REGISTRATION_FAILED", "Não foi possível registrar o código.");
  return { item, package: packageRow };
}

/** Keeps an already-issued import code aligned with a later mascot rename. */
export async function refreshPackageDisplayName(userId: string, itemId: string, displayName: string) {
  const admin = createAdminClient();
  if (!admin) throw new MascotPackageError("PACKAGE_STORAGE_UNAVAILABLE", "Armazenamento de pacotes não configurado.");
  const existing = await findPackage(admin, userId, itemId);
  if (!existing) return;
  const currentManifest = existing.manifest as Record<string, unknown>;
  if (currentManifest.displayName === displayName) return;
  const packageVersion = nextPackageVersion(existing.package_version);
  const manifest = { ...currentManifest, packageVersion, displayName };
  const { error } = await admin.from("mascot_packages")
    .update({ package_version: packageVersion, manifest, status: "ready" })
    .eq("id", existing.id).eq("user_id", userId);
  if (error) throw new MascotPackageError("PACKAGE_REGISTRATION_FAILED", "Não foi possível atualizar o pacote com o novo nome.");
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
    const normalized = await prepareMascotDisplayAsset(source, "full");
    const hash = createHash("sha256").update(normalized.bytes).digest("hex");
    const metadata = await sharp(normalized.bytes).metadata();
    const extension = "png";
    const storagePath = `${userId}/${item.id}/${version}/${role}.${extension}`;
    const upload = await admin.storage.from(BUCKET).upload(storagePath, normalized.bytes, { contentType: normalized.contentType, upsert: false });
    if (upload.error && !upload.error.message.toLowerCase().includes("already exists")) throw new MascotPackageError("PACKAGE_ASSET_UPLOAD_FAILED", "Não foi possível guardar um asset.");
    assets.push({ poseId: `${item.id}-${role}`, role: role.toUpperCase() as Uppercase<PoseRole>, storagePath, sha256: hash, expectedBytes: normalized.bytes.length, mimeType: normalized.contentType, width: metadata.width ?? 0, height: metadata.height ?? 0 });
  }
  return assets;
}

function packageMatchesCurrentOutput(existing: { package_version: string; manifest: unknown }, displayName: string) {
  const manifest = existing.manifest as { assetPipelineVersion?: number; displayName?: string };
  return manifest.assetPipelineVersion === 2 && manifest.displayName === displayName;
}

function nextPackageVersion(existingVersion?: string) {
  if (!existingVersion) return "1.0.0";
  const parts = existingVersion.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) return "1.0.1";
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function hashCode(code: string) { return createHash("sha256").update(code.trim().toUpperCase()).digest("hex"); }
