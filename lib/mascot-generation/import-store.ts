import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findLibraryItemByJob } from "./library-store";
import { parseReadyManifest, type MascotPackageManifest, type MascotPackageRow } from "./package-store";
import { findHatchedPostBirthAttempt } from "./post-birth-route-context";
import { findPostBirthProfile } from "./post-birth-store";

const CODE_PREFIX = "GRU";
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 8;
const CODE_TTL_SECONDS = 900;
const MAX_CODE_INSERT_ATTEMPTS = 5;

type ImportCodeRow = {
  id: string;
  package_id: string;
  user_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type CreatedImportCode = {
  id: string;
  code: string;
  packageId: string;
  expiresAt: string;
  createdAt: string;
};

export type ResolvedImportCode = {
  code: string;
  codeRow: ImportCodeRow;
  package: MascotPackageRow & { user_id: string };
  manifest: MascotPackageManifest;
};

export class ImportCodeError extends Error {
  readonly status: 400 | 404 | 409 | 410 | 503;

  constructor(
    readonly code: "IMPORT_CODE_INVALID" | "IMPORT_CODE_EXPIRED" | "IMPORT_CODE_REVOKED" | "IMPORT_PACKAGE_UNAVAILABLE" | "IMPORT_CODE_STORAGE_UNAVAILABLE",
    message = "Não foi possível processar o código de importação.",
    status: 400 | 404 | 409 | 410 | 503 = importCodeStatus(code),
  ) {
    super(message);
    this.name = "ImportCodeError";
    this.status = status;
  }
}

export function isValidImportCode(value: string) {
  return /^GRU-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}

export function normalizeImportCode(value: string) {
  return value.trim().toUpperCase();
}

export async function createPostBirthImportCode(
  client: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  jobId: string,
) {
  const attempt = await findHatchedPostBirthAttempt(client, userId, jobId);
  if (!attempt) throw new ImportCodeError("IMPORT_PACKAGE_UNAVAILABLE", "O mascote ainda não está disponível para importação.", 404);
  const profile = await findPostBirthProfile(client, userId, attempt.attempt_id);
  if (!profile) throw new ImportCodeError("IMPORT_PACKAGE_UNAVAILABLE", "O perfil pós-nascimento não foi encontrado.", 404);
  if (profile.state !== "ACTIVE") throw new ImportCodeError("IMPORT_PACKAGE_UNAVAILABLE", "Ative o perfil pós-nascimento antes de importar o mascote.", 409);
  const item = await findLibraryItemByJob(client, userId, jobId);
  if (!item) throw new ImportCodeError("IMPORT_PACKAGE_UNAVAILABLE", "O mascote ativo ainda não possui um item de biblioteca.", 404);
  return createImportCode(admin, userId, item.id);
}

export async function createLibraryImportCode(
  admin: SupabaseClient,
  userId: string,
  libraryItemId: string,
) {
  const { data, error } = await admin.from("mascot_packages")
    .select("id")
    .eq("user_id", userId)
    .eq("library_item_id", libraryItemId)
    .maybeSingle<{ id: string }>();
  if (error) throw new ImportCodeError("IMPORT_CODE_STORAGE_UNAVAILABLE");
  if (!data) throw new ImportCodeError("IMPORT_PACKAGE_UNAVAILABLE", "O pacote do mascote ainda não está pronto.", 409);
  return createImportCode(admin, userId, data.id);
}

export async function createImportCode(
  admin: SupabaseClient,
  userId: string,
  packageId: string,
  now = new Date(),
): Promise<CreatedImportCode> {
  const packageRow = await findReadyPackage(admin, userId, packageId);
  const expiresAt = new Date(now.getTime() + getCodeTtlSeconds() * 1000).toISOString();

  for (let attempt = 0; attempt < MAX_CODE_INSERT_ATTEMPTS; attempt += 1) {
    const code = generateImportCode();
    const { data, error } = await admin.from("mascot_import_codes").insert({
      package_id: packageRow.id,
      user_id: userId,
      code_hash: hashImportCode(code),
      expires_at: expiresAt,
      revoked_at: null,
    }).select("id, package_id, user_id, expires_at, revoked_at, created_at").single<ImportCodeRow>();
    if (!error && data) return { id: data.id, code, packageId: data.package_id, expiresAt: data.expires_at ?? expiresAt, createdAt: data.created_at };
    if (error?.code === "23505") continue;
    throw new ImportCodeError("IMPORT_CODE_STORAGE_UNAVAILABLE");
  }
  throw new ImportCodeError("IMPORT_CODE_STORAGE_UNAVAILABLE");
}

export async function resolveImportCode(
  admin: SupabaseClient,
  value: string,
  now = new Date(),
): Promise<ResolvedImportCode> {
  const code = normalizeImportCode(value);
  if (!isValidImportCode(code)) throw new ImportCodeError("IMPORT_CODE_INVALID", "O código de importação é inválido.", 400);
  const { data: codeRow, error } = await admin.from("mascot_import_codes")
    .select("id, package_id, user_id, expires_at, revoked_at, created_at")
    .eq("code_hash", hashImportCode(code))
    .maybeSingle<ImportCodeRow>();
  if (error) throw new ImportCodeError("IMPORT_CODE_STORAGE_UNAVAILABLE");
  if (!codeRow) throw new ImportCodeError("IMPORT_CODE_INVALID", "O código de importação não foi encontrado.", 404);
  if (codeRow.revoked_at) throw new ImportCodeError("IMPORT_CODE_REVOKED", "O código de importação foi revogado.", 410);
  if (!codeRow.expires_at || new Date(codeRow.expires_at).getTime() <= now.getTime()) throw new ImportCodeError("IMPORT_CODE_EXPIRED", "O código de importação expirou.", 410);

  const packageRow = await findReadyPackage(admin, codeRow.user_id, codeRow.package_id);
  const manifest = parseReadyManifest(packageRow.manifest);
  if (!manifest || manifest.packageId !== packageRow.id || manifest.mascotId.length === 0) {
    throw new ImportCodeError("IMPORT_PACKAGE_UNAVAILABLE", "O pacote associado não é válido.", 409);
  }
  return { code, codeRow, package: packageRow, manifest };
}

export async function revokeImportCode(
  admin: SupabaseClient,
  userId: string,
  value: string,
  now = new Date(),
) {
  const code = normalizeImportCode(value);
  if (!isValidImportCode(code)) throw new ImportCodeError("IMPORT_CODE_INVALID", "O código de importação é inválido.", 400);
  const { data: current, error: lookupError } = await admin.from("mascot_import_codes")
    .select("id, package_id, user_id, expires_at, revoked_at, created_at")
    .eq("user_id", userId).eq("code_hash", hashImportCode(code)).maybeSingle<ImportCodeRow>();
  if (lookupError) throw new ImportCodeError("IMPORT_CODE_STORAGE_UNAVAILABLE");
  if (!current) throw new ImportCodeError("IMPORT_CODE_INVALID", "O código de importação não foi encontrado.", 404);
  if (current.revoked_at) throw new ImportCodeError("IMPORT_CODE_REVOKED", "O código de importação foi revogado.", 410);
  if (!current.expires_at || new Date(current.expires_at).getTime() <= now.getTime()) throw new ImportCodeError("IMPORT_CODE_EXPIRED", "O código de importação expirou.", 410);
  const { error } = await admin.from("mascot_import_codes").update({ revoked_at: now.toISOString() })
    .eq("id", current.id).eq("user_id", userId);
  if (error) throw new ImportCodeError("IMPORT_CODE_STORAGE_UNAVAILABLE");
  return { ...current, revoked_at: now.toISOString() };
}

function generateImportCode() {
  const characters: string[] = [];
  const bucketSize = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  while (characters.length < CODE_LENGTH) {
    for (const value of randomBytes(CODE_LENGTH)) {
      if (value >= bucketSize) continue;
      characters.push(CODE_ALPHABET[value % CODE_ALPHABET.length]);
      if (characters.length === CODE_LENGTH) break;
    }
  }
  return `${CODE_PREFIX}-${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}

function hashImportCode(code: string) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

async function findReadyPackage(admin: SupabaseClient, userId: string, packageId: string) {
  const { data, error } = await admin.from("mascot_packages")
    .select("id, user_id, package_version, manifest, status")
    .eq("id", packageId).eq("user_id", userId).maybeSingle<MascotPackageRow & { user_id: string }>();
  if (error) throw new ImportCodeError("IMPORT_CODE_STORAGE_UNAVAILABLE");
  if (!data || data.status !== "ready") throw new ImportCodeError("IMPORT_PACKAGE_UNAVAILABLE", "O pacote do mascote ainda não está pronto.", 409);
  const manifest = parseReadyManifest(data.manifest);
  if (!manifest || manifest.packageId !== data.id) throw new ImportCodeError("IMPORT_PACKAGE_UNAVAILABLE", "O pacote do mascote é inválido.", 409);
  return data;
}

function getCodeTtlSeconds() {
  const configured = Number(process.env.MASCOT_IMPORT_CODE_TTL_SECONDS);
  return Number.isInteger(configured) && configured >= 60 && configured <= 86_400 ? configured : CODE_TTL_SECONDS;
}

function importCodeStatus(code: ImportCodeError["code"]): ImportCodeError["status"] {
  if (code === "IMPORT_CODE_INVALID") return 404;
  if (code === "IMPORT_CODE_EXPIRED" || code === "IMPORT_CODE_REVOKED") return 410;
  if (code === "IMPORT_PACKAGE_UNAVAILABLE") return 409;
  return 503;
}
