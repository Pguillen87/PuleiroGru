import { beforeEach, describe, expect, it } from "vitest";
import { createImportCode, ImportCodeError, resolveImportCode, revokeImportCode } from "@/lib/mascot-generation/import-store";
import type { MascotPackageManifest } from "@/lib/mascot-generation/package-store";
import type { SupabaseClient } from "@supabase/supabase-js";

const NOW = new Date("2026-09-07T12:00:00.000Z");
const OWNER_ID = "owner-import-1";
const PACKAGE_ID = "package-import-1";

const manifest: MascotPackageManifest = {
  schemaVersion: 1,
  assetPipelineVersion: 3,
  packageId: PACKAGE_ID,
  mascotId: "mascot-1",
  packageVersion: "1.0.0",
  createdAt: NOW.toISOString(),
  publishedAt: NOW.toISOString(),
  displayName: "Mascote Importável",
  visibility: "PRIVATE",
  assets: ["NORMAL", "LISTENING", "TRANSCRIBING"].map((role) => ({
    poseId: `pose-${role}`,
    role: role as "NORMAL" | "LISTENING" | "TRANSCRIBING",
    storagePath: `v1/${OWNER_ID}/${PACKAGE_ID}/${role.toLowerCase()}/asset.png`,
    sha256: "a".repeat(64),
    expectedBytes: 100,
    mimeType: "image/png" as const,
    width: 64,
    height: 64,
  })),
};

function packageRow() {
  return { id: PACKAGE_ID, user_id: OWNER_ID, package_version: "1.0.0", manifest, status: "ready" };
}

function createFakeAdmin() {
  const codes: Array<Record<string, unknown>> = [];
  const inserted: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let updatePayload: Record<string, unknown> | null = null;
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async <T>() => ({ data: findRow(table, filters) as T | null, error: null }),
        single: async <T>() => {
          const row = { id: `code-${codes.length + 1}`, created_at: NOW.toISOString(), ...updatePayload, ...inserted.at(-1) };
          return { data: row as T, error: null };
        },
        insert: (payload: Record<string, unknown>) => {
          inserted.push(payload);
          codes.push({ id: `code-${codes.length + 1}`, created_at: NOW.toISOString(), ...payload });
          return query;
        },
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          const row = findRow(table, filters);
          if (row) Object.assign(row, payload);
          return query;
        },
        then: (resolve: (value: { data: null; error: null }) => unknown) => Promise.resolve(resolve({ data: null, error: null })),
      };
      return query;
    },
    _codes: codes,
    _inserted: inserted,
  };
  function findRow(table: string, filters: Record<string, unknown>) {
    if (table === "mascot_packages") {
      const row = packageRow();
      return Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value) ? row : null;
    }
    return codes.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null;
  }
  return admin as unknown as SupabaseClient & { _codes: typeof codes; _inserted: typeof inserted };
}

describe("mascot import code store", () => {
  beforeEach(() => {
    delete process.env.MASCOT_IMPORT_CODE_TTL_SECONDS;
  });

  it("gera códigos alfanuméricos distintos e persiste apenas o hash", async () => {
    const admin = createFakeAdmin();
    const first = await createImportCode(admin, OWNER_ID, PACKAGE_ID, NOW);
    const second = await createImportCode(admin, OWNER_ID, PACKAGE_ID, NOW);

    expect(first.code).toMatch(/^GRU-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(second.code).toMatch(/^GRU-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(second.code).not.toBe(first.code);
    expect(admin._inserted[0]).not.toHaveProperty("code");
    expect(admin._inserted[0].code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(admin._inserted[0]).toMatchObject({ package_id: PACKAGE_ID, user_id: OWNER_ID, revoked_at: null });
    expect(new Date(first.expiresAt).getTime()).toBe(NOW.getTime() + 900_000);
  });

  it("resolve um código válido para o manifesto do pacote pronto", async () => {
    const admin = createFakeAdmin();
    const created = await createImportCode(admin, OWNER_ID, PACKAGE_ID, NOW);

    await expect(resolveImportCode(admin, created.code, NOW)).resolves.toMatchObject({
      code: created.code,
      package: { id: PACKAGE_ID, status: "ready" },
      manifest: { packageId: PACKAGE_ID, mascotId: "mascot-1" },
    });
  });

  it("rejeita código expirado e revogado", async () => {
    const expiredAdmin = createFakeAdmin();
    const expired = await createImportCode(expiredAdmin, OWNER_ID, PACKAGE_ID, NOW);
    expiredAdmin._codes[0].expires_at = new Date(NOW.getTime() - 1).toISOString();
    await expect(resolveImportCode(expiredAdmin, expired.code, NOW)).rejects.toMatchObject({ code: "IMPORT_CODE_EXPIRED", status: 410 });

    const revokedAdmin = createFakeAdmin();
    const revoked = await createImportCode(revokedAdmin, OWNER_ID, PACKAGE_ID, NOW);
    await revokeImportCode(revokedAdmin, OWNER_ID, revoked.code, NOW);
    await expect(resolveImportCode(revokedAdmin, revoked.code, NOW)).rejects.toMatchObject({ code: "IMPORT_CODE_REVOKED", status: 410 });
  });

  it("rejeita código malformado antes de consultar o banco", async () => {
    await expect(resolveImportCode(createFakeAdmin(), "not-a-code", NOW)).rejects.toBeInstanceOf(ImportCodeError);
    await expect(resolveImportCode(createFakeAdmin(), "not-a-code", NOW)).rejects.toMatchObject({ code: "IMPORT_CODE_INVALID", status: 400 });
  });
});
