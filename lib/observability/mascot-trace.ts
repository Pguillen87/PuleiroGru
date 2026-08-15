import "server-only";
import { NextResponse } from "next/server";

const SAFE_FIELDS = new Set([
  "timestamp", "environment", "service", "event", "result", "durationMs",
  "puleiroTraceId", "attemptId", "operationId", "requestId", "jobId",
  "masterId", "poseRole", "safeErrorCode", "httpStatus",
]);

export type MascotTraceContext = {
  puleiroTraceId: string;
  attemptId: string;
  requestId: string;
  operationId?: string;
};

export function createTraceContext(attemptId: string, mutable = false): MascotTraceContext {
  return {
    puleiroTraceId: `puleiro_${attemptId.replace(/-/g, "")}`,
    attemptId,
    requestId: crypto.randomUUID(),
    operationId: mutable ? crypto.randomUUID() : undefined,
  };
}

export function traceResponse<T extends NextResponse>(response: T, context: MascotTraceContext, modalRequestId?: string) {
  response.headers.set("X-Correlation-Id", context.puleiroTraceId);
  response.headers.set("X-Request-Id", context.requestId);
  if (context.operationId) response.headers.set("X-Operation-Id", context.operationId);
  if (modalRequestId) response.headers.set("X-Modal-Request-Id", modalRequestId);
  return response;
}

export function supportCode(context: Pick<MascotTraceContext, "requestId">) {
  return context.requestId.replace(/-/g, "").slice(0, 10).toUpperCase();
}

export function mascotLog(event: string, fields: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "unknown",
    service: "puleiro-bff",
    event,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (SAFE_FIELDS.has(key) && isSafeValue(value)) payload[key] = value;
  }
  console.log(JSON.stringify(payload));
}

function isSafeValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null;
}
