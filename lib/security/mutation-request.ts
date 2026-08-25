import "server-only";

export class MutationRequestRejected extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

type MutationRequestOptions = {
  contentTypes: readonly string[];
};

export function requireTrustedMutationRequest(
  request: Request,
  { contentTypes }: MutationRequestOptions,
) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedOrigin(origin, requestOrigin)) {
    throw new MutationRequestRejected("ORIGIN_REJECTED", "A origem desta solicitação não é permitida.");
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new MutationRequestRejected("CROSS_SITE_REJECTED", "Solicitação entre sites bloqueada.");
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !contentTypes.includes(contentType)) {
    throw new MutationRequestRejected("CONTENT_TYPE_REJECTED", "O formato desta solicitação não é permitido.");
  }
}

function isAllowedOrigin(origin: string, requestOrigin: string) {
  // A mutation made by the Puleiro UI must come from the exact public origin
  // serving this request. This works for Vercel aliases and a future custom
  // domain without turning an unset environment variable into a production
  // outage. Additional origins remain an explicit opt-in.
  if (origin === requestOrigin) return true;

  const configured = (process.env.PULEIRO_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(origin);
}
