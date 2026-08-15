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
  const allowedOrigins = configuredOrigins(requestOrigin);
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
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

function configuredOrigins(requestOrigin: string) {
  const configured = (process.env.PULEIRO_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length > 0) return new Set(configured);
  if (process.env.NODE_ENV === "production") return new Set<string>();
  return new Set([requestOrigin]);
}
