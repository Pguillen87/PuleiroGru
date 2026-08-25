import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/browser-auth";
import { ModalProviderError } from "./modal-provider";
import { MutationRequestRejected } from "@/lib/security/mutation-request";
import { supportCode, traceResponse, type MascotTraceContext } from "@/lib/observability/mascot-trace";

export function integrationErrorResponse(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  trace?: MascotTraceContext,
) {
  const auth = authErrorResponse(error);
  if (auth) return traced(auth, trace);
  if (error instanceof MutationRequestRejected) {
    return traced(NextResponse.json({
      message: error.message,
      code: error.code,
      ...(trace ? { supportCode: supportCode(trace) } : {}),
    }, { status: 403 }), trace);
  }
  if (error instanceof ModalProviderError) {
    // The browser is not the caller authenticated by Modal v2. A rejected
    // BFF-to-Modal credential must never look like the person's session ended.
    const integrationAuthFailure = error.code === "BFF_TOKEN_INVALID" || error.code === "WEB_V2_DISABLED";
    const status = integrationAuthFailure ? 503 : error.status >= 400 && error.status < 500 ? error.status : 503;
    const safeMessages: Record<string, string> = {
      GENERATION_DISABLED: "A geração real ainda não foi autorizada.",
      POSE_GENERATION_DISABLED: "A criação de poses ainda não está disponível.",
      RATE_LIMITED: "O limite temporário de testes deste ambiente foi atingido. Tente novamente mais tarde.",
      COST_LIMIT_REACHED: "O limite temporário de testes deste ambiente foi atingido. Tente novamente mais tarde.",
      MASTER_CACHE_UNAVAILABLE: "O Puleiro está preparando a oficina de geração. Tente novamente em instantes.",
      MASTER_AUTHORIZATION_UNAVAILABLE: "O Puleiro não conseguiu reservar este nascimento agora. Tente novamente em instantes.",
      MASTER_WORKER_ENQUEUE_FAILED: "A oficina de geração não respondeu. Tente novamente em instantes.",
      MASTER_WORKER_RECORD_UNAVAILABLE: "O nascimento foi iniciado, mas ainda não pôde ser confirmado. Aguarde um instante e atualize a página.",
      BFF_TOKEN_INVALID: "O Puleiro não conseguiu confirmar a conexão segura com a oficina. Tente retomar este nascimento em instantes.",
      WEB_V2_DISABLED: "A oficina do Puleiro está temporariamente indisponível. Tente retomar este nascimento em instantes.",
      JOB_NOT_FOUND: "Nascimento não encontrado.",
      ATTEMPT_MISMATCH: "Esta tentativa não pertence à sessão atual.",
    };
    return traced(NextResponse.json({
      message: safeMessages[error.code] ?? fallbackMessage,
      code: error.code,
      ...(trace ? { supportCode: supportCode(trace) } : {}),
    }, { status }), trace);
  }
  return traced(NextResponse.json({
    message: fallbackMessage,
    code: fallbackCode,
    ...(trace ? { supportCode: supportCode(trace) } : {}),
  }, { status: 503 }), trace);
}

function traced<T extends NextResponse | Response>(response: T, trace?: MascotTraceContext) {
  if (!trace) return response;
  if (response instanceof NextResponse) return traceResponse(response, trace);
  response.headers.set("X-Correlation-Id", trace.puleiroTraceId);
  response.headers.set("X-Request-Id", trace.requestId);
  if (trace.operationId) response.headers.set("X-Operation-Id", trace.operationId);
  return response;
}
