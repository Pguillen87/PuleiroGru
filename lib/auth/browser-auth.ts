import "server-only";
import { generationConfig } from "@/lib/mascot-generation/config";
import { createClient } from "@/lib/supabase/server";

export class RequestAuthError extends Error {
  constructor(readonly status: 401 | 403 | 500, readonly code: string, message: string) {
    super(message);
  }
}

let warned = false;

export function ensureDevTestIdentityAllowed(nodeEnv: string | undefined, masterEnabled: boolean, poseEnabled: boolean) {
  if (nodeEnv === "production") {
    throw new RequestAuthError(500, "DEV_IDENTITY_FORBIDDEN", "Identidade de teste proibida em produção.");
  }
  if (masterEnabled || poseEnabled) {
    throw new RequestAuthError(500, "DEV_IDENTITY_UNSAFE", "Identidade de teste exige geração desabilitada.");
  }
}

function devIdentity(request: Request) {
  ensureDevTestIdentityAllowed(process.env.NODE_ENV, generationConfig.masterGenerationEnabled, generationConfig.poseGenerationEnabled);
  if (!warned) {
    warned = true;
    console.warn("dev_test_identity_enabled", { gpuGenerationEnabled: false });
  }
  const requested = request.headers.get("x-dev-test-uid") ?? "local-puleiro-user";
  return /^[A-Za-z0-9_-]{3,128}$/.test(requested) ? requested : "local-puleiro-user";
}

export async function requireBrowserIdentity(request: Request) {
  if (generationConfig.allowDevTestIdentity) return { uid: devIdentity(request), mode: "development" as const };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new RequestAuthError(401, "SESSION_EXPIRED", "Sua sessão terminou. Entre novamente para continuar.");
  }
  return { uid: data.user.id, mode: "supabase-session" as const };
}

export async function optionalBrowserIdentity(request: Request) {
  if (generationConfig.allowDevTestIdentity) return { uid: devIdentity(request), mode: "development" as const };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { uid: data.user.id, mode: "supabase-session" as const };
}

export function authErrorResponse(error: unknown) {
  if (!(error instanceof RequestAuthError)) return undefined;
  return Response.json({ message: error.message, code: error.code }, { status: error.status });
}
