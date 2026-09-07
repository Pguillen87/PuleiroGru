import { readFileSync, existsSync } from "node:fs";

loadLocalEnvironment();

const provider = process.env.MASCOT_GENERATION_PROVIDER ?? "mock";
const modalUrl = process.env.MODAL_MASCOT_API_URL?.replace(/\/$/, "") ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

console.log(`provider=${provider}`);
console.log(`provider_supported=${provider === "modal"}`);
console.log(`modal_url_configured=${Boolean(modalUrl)}`);
console.log(`modal_secret_configured=${Boolean(process.env.MODAL_BFF_JWT_SECRET)}`);
console.log(`supabase_url_configured=${Boolean(supabaseUrl)}`);
console.log(`supabase_anon_key_configured=${Boolean(anonKey)}`);
console.log(`supabase_service_role_configured=${Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}`);

const probes = [];
if (modalUrl) probes.push(probe("modal_health", `${modalUrl}/health`));
if (supabaseUrl) {
  const headers = anonKey ? { apikey: anonKey } : undefined;
  probes.push(probe("supabase_auth_health", `${supabaseUrl}/auth/v1/health`, headers));
  probes.push(probe("supabase_storage_read", `${supabaseUrl}/storage/v1/bucket`, headers));
}

const results = await Promise.all(probes);
for (const result of results) console.log(`${result.name}=${result.value}`);

const required = provider === "modal"
  && Boolean(modalUrl && process.env.MODAL_BFF_JWT_SECRET)
  && Boolean(supabaseUrl && anonKey && process.env.SUPABASE_SERVICE_ROLE_KEY);
const reachable = results.length > 0 && results.every(({ value }) => value.startsWith("reachable_"));
console.log(`configuration_ready=${required}`);
console.log(`handshake_reachable=${reachable}`);

if (!required || !reachable) process.exitCode = 2;

async function probe(name, url, headers) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    return { name, value: `reachable_http_${response.status}` };
  } catch (error) {
    return { name, value: `unreachable_${error instanceof Error ? error.name : "error"}` };
  }
}

function loadLocalEnvironment() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    if (!process.env[name]) process.env[name] = line.slice(separator + 1).trim();
  }
}
