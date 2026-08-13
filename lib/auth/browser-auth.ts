import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { generationConfig } from "@/lib/mascot-generation/config";

export class RequestAuthError extends Error {
  constructor(readonly status: 401 | 403 | 500, readonly code: string, message: string) {
    super(message);
  }
}

let warned = false;
export const FIREBASE_SESSION_COOKIE = "puleiro_session";

export function ensureDevTestIdentityAllowed(nodeEnv: string | undefined, masterEnabled: boolean, poseEnabled: boolean) {
  if (nodeEnv === "production") {
    throw new RequestAuthError(500, "DEV_IDENTITY_FORBIDDEN", "Identidade de teste proibida em produção.");
  }
  if (masterEnabled || poseEnabled) {
    throw new RequestAuthError(500, "DEV_IDENTITY_UNSAFE", "Identidade de teste exige geração desabilitada.");
  }
}

export type BrowserTokenVerifier = {
  verifyIdToken(token: string): Promise<{ uid: string }>;
  verifyAppCheck(token: string): Promise<unknown>;
};

export async function verifyBrowserTokens(
  authorization: string | null,
  appCheckToken: string | null,
  verifier: BrowserTokenVerifier,
) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new RequestAuthError(401, "AUTH_REQUIRED", "Autenticação necessária.");
  }
  if (!appCheckToken) throw new RequestAuthError(403, "APP_CHECK_REQUIRED", "Verificação do aplicativo necessária.");
  try {
    const [identity] = await Promise.all([
      verifier.verifyIdToken(authorization.slice(7)),
      verifier.verifyAppCheck(appCheckToken),
    ]);
    return identity.uid;
  } catch (error) {
    if (error instanceof RequestAuthError) throw error;
    throw new RequestAuthError(401, "AUTH_INVALID", "Sessão inválida ou expirada.");
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

function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (!raw) return initializeApp();
  try {
    return initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch {
    throw new RequestAuthError(500, "FIREBASE_CONFIG_INVALID", "Configuração de autenticação inválida.");
  }
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  return cookies.map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function createBrowserSession(authorization: string | null, appCheckToken: string | null) {
  const app = adminApp();
  const verifier = {
    verifyIdToken: (token: string) => getAuth(app).verifyIdToken(token, true),
    verifyAppCheck: (token: string) => getAppCheck(app).verifyToken(token),
  };
  const uid = await verifyBrowserTokens(authorization, appCheckToken, verifier);
  const idToken = authorization!.slice(7);
  const sessionCookie = await getAuth(app).createSessionCookie(idToken, { expiresIn: 60 * 60 * 24 * 5 * 1000 });
  return { uid, sessionCookie };
}

export async function requireBrowserIdentity(request: Request) {
  if (generationConfig.allowDevTestIdentity) return { uid: devIdentity(request), mode: "development" as const };

  const sessionCookie = cookieValue(request, FIREBASE_SESSION_COOKIE);
  if (sessionCookie) {
    try {
      const identity = await getAuth(adminApp()).verifySessionCookie(decodeURIComponent(sessionCookie), true);
      return { uid: identity.uid, mode: "firebase-session" as const };
    } catch {
      throw new RequestAuthError(401, "SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
    }
  }

  const app = adminApp();
  const uid = await verifyBrowserTokens(
    request.headers.get("authorization"),
    request.headers.get("x-firebase-appcheck"),
    {
      verifyIdToken: (token) => getAuth(app).verifyIdToken(token, true),
      verifyAppCheck: (token) => getAppCheck(app).verifyToken(token),
    },
  );
  return { uid, mode: "firebase" as const };
}

export function authErrorResponse(error: unknown) {
  if (!(error instanceof RequestAuthError)) return undefined;
  return Response.json({ message: error.message, code: error.code }, { status: error.status });
}
