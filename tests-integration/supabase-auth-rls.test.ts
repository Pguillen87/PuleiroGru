import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadLocalEnvironment();

const enabled = process.env.RUN_REAL_STAGING_TESTS === "true";
const suite = enabled ? describe : describe.skip;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const modalUrl = process.env.MODAL_MASCOT_API_URL?.replace(/\/$/, "") ?? "";
const modalSecret = process.env.MODAL_BFF_JWT_SECRET ?? "";
const recoveryTestEmail = process.env.SUPABASE_RECOVERY_TEST_EMAIL ?? "";
const recoveryTest = recoveryTestEmail ? it : it.skip;

suite("Supabase Auth e RLS reais", () => {
  let admin: SupabaseClient;
  let first!: TestIdentity;
  let second!: TestIdentity;
  let signupUser: User | null = null;

  beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error("Configuração real do Supabase ausente.");
    admin = createClient(url, serviceKey, noSession());
    first = await createIdentity(admin);
    second = await createIdentity(admin);
  });

  afterAll(async () => {
    const ids = [first?.userId, second?.userId, signupUser?.id].filter(Boolean) as string[];
    await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("cadastra e inicia sessão sem confirmação por e-mail", async () => {
    const client = createClient(url, anonKey, noSession());
    const email = `puleiro-signup-${randomUUID()}@puleirogru.dev`;
    const { data, error } = await client.auth.signUp({ email, password: password() });
    expect(error).toBeNull();
    expect(data.user?.id).toBeTruthy();
    expect(data.session).toBeTruthy();
    signupUser = data.user;
  });

  it("valida login, renovação, logout e credencial inválida", async () => {
    const client = createClient(url, anonKey, noSession());
    const invalid = await client.auth.signInWithPassword({ email: first.email, password: "senha-incorreta" });
    expect(invalid.error).toBeTruthy();

    const signedIn = await client.auth.signInWithPassword({ email: first.email, password: first.password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.id).toBe(first.userId);
    const refreshed = await client.auth.refreshSession({ refresh_token: signedIn.data.session!.refresh_token });
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.user?.id).toBe(first.userId);
    expect((await client.auth.signOut()).error).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });

  it("preserva e valida a sessão em cookies SSR", async () => {
    const browserClient = createClient(url, anonKey, noSession());
    const { data, error } = await browserClient.auth.signInWithPassword({
      email: first.email,
      password: first.password,
    });
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();

    const cookies = new Map<string, string>();
    const writer = ssrClient(cookies);
    expect((await writer.auth.setSession({
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
    })).error).toBeNull();
    expect(cookies.size).toBeGreaterThan(0);

    const reader = ssrClient(cookies);
    const verified = await reader.auth.getUser();
    expect(verified.error).toBeNull();
    expect(verified.data.user?.id).toBe(first.userId);
    expect((await reader.auth.signOut()).error).toBeNull();
  });

  recoveryTest("solicita recuperação para uma caixa postal controlada", async () => {
    const client = createClient(url, anonKey, noSession());
    const known = await client.auth.resetPasswordForEmail(recoveryTestEmail);
    expect(known.error).toBeNull();
  });

  it("isola mascot_attempts por auth.uid()", async () => {
    const firstClient = await authenticatedClient(first);
    const secondClient = await authenticatedClient(second);
    const attemptId = randomUUID();
    const inserted = await firstClient.from("mascot_attempts").insert({
      user_id: first.userId,
      attempt_id: attemptId,
      status: "registered",
    }).select("attempt_id").single();
    expect(inserted.error).toBeNull();

    const invisible = await secondClient.from("mascot_attempts").select("attempt_id").eq("attempt_id", attemptId);
    expect(invisible.error).toBeNull();
    expect(invisible.data).toEqual([]);
    const forbidden = await secondClient.from("mascot_attempts").insert({
      user_id: first.userId,
      attempt_id: randomUUID(),
      status: "registered",
    });
    expect(forbidden.error).toBeTruthy();
  });

  it("registra e retoma no Modal staging com Supabase user.id sem acionar geração", async () => {
    if (!modalUrl || modalSecret.length < 32) throw new Error("Configuração do Modal staging ausente.");
    const attemptId = `attempt-${randomUUID()}`;
    const token = await modalToken(first.userId, attemptId);
    const idempotencyKey = `register:${first.userId}:${attemptId}`;
    const image = await sharp({
      create: { width: 256, height: 256, channels: 3, background: "#d9b35f" },
    }).png().toBuffer();
    const body = JSON.stringify({
      image_base64: image.toString("base64"),
      content_type: "image/png",
      attempt_id: attemptId,
    });
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    };

    const health = await fetch(`${modalUrl}/health`).then((response) => response.json());
    expect(health.environment).toBe("staging");
    expect(health.generation_enabled).toBe(false);

    const registered = await fetch(`${modalUrl}/v2/mascot/jobs`, { method: "POST", headers, body });
    expect(registered.status).toBe(202);
    const job = await registered.json() as { jobId: string; generationScheduled: boolean };
    expect(job.generationScheduled).toBe(false);

    const replay = await fetch(`${modalUrl}/v2/mascot/jobs`, { method: "POST", headers, body });
    expect((await replay.json()).jobId).toBe(job.jobId);
    const resumed = await fetch(`${modalUrl}/v2/mascot/jobs?attempt_id=${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resumed.status).toBe(200);
    expect((await resumed.json()).jobId).toBe(job.jobId);

    const master = await fetch(`${modalUrl}/v2/mascot/jobs/${job.jobId}/master-generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "X-Idempotency-Key": `master:${attemptId}` },
    });
    const poses = await fetch(`${modalUrl}/v2/mascot/jobs/${job.jobId}/pose-generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "X-Idempotency-Key": `poses:${attemptId}` },
    });
    expect(master.status).toBe(409);
    expect(poses.status).toBe(409);

    const otherOwnerToken = await modalToken(second.userId, attemptId);
    const forbidden = await fetch(`${modalUrl}/v2/mascot/jobs/${job.jobId}`, {
      headers: { Authorization: `Bearer ${otherOwnerToken}` },
    });
    expect(forbidden.status).toBe(404);
  });

  async function authenticatedClient(identity: TestIdentity) {
    const client = createClient(url, anonKey, noSession());
    const { data, error } = await client.auth.signInWithPassword({ email: identity.email, password: identity.password });
    if (error || !data.session) throw error ?? new Error("Sessão real ausente.");
    return client;
  }
});

type TestIdentity = { email: string; password: string; userId: string };

async function createIdentity(admin: SupabaseClient): Promise<TestIdentity> {
  const identity = { email: `puleiro-test-${randomUUID()}@puleirogru.dev`, password: password() };
  const { data, error } = await admin.auth.admin.createUser({ ...identity, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Usuário de teste não criado.");
  return { ...identity, userId: data.user.id };
}

function noSession() {
  return { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
}

function ssrClient(cookieJar: Map<string, string>) {
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: (updates) => updates.forEach(({ name, value }) => cookieJar.set(name, value)),
    },
  });
}

function password() {
  return `Puleiro-${randomUUID()}-9a!`;
}

async function modalToken(ownerId: string, attemptId: string) {
  const secret = new TextEncoder().encode(modalSecret);
  return new SignJWT({ attempt_id: attemptId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("puleiro-bff")
    .setAudience("gru-modal")
    .setSubject(ownerId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("90s")
    .sign(secret);
}

function loadLocalEnvironment() {
  const source = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    if (!process.env[name]) process.env[name] = line.slice(separator + 1).trim();
  }
}
