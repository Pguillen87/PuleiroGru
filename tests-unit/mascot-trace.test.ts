import { describe, expect, it, vi } from "vitest";
import { createTraceContext, mascotLog, mascotObservabilityEnvironment, traceResponse } from "@/lib/observability/mascot-trace";
import { NextResponse } from "next/server";

describe("trace distribuído do Puleiro", () => {
  it("mantém o trace por tentativa e cria request e operação independentes", () => {
    const attemptId = "4ba644dc-51ab-4b79-a4ae-3ef51b9aa3b0";
    const first = createTraceContext(attemptId, true);
    const second = createTraceContext(attemptId, true);

    expect(first.puleiroTraceId).toBe(second.puleiroTraceId);
    expect(first.requestId).not.toBe(second.requestId);
    expect(first.operationId).not.toBe(second.operationId);
    expect(first.puleiroTraceId).not.toContain("uid");
  });

  it("preserva IDs BFF e Modal na resposta", () => {
    const trace = createTraceContext("4ba644dc-51ab-4b79-a4ae-3ef51b9aa3b0", true);
    const response = traceResponse(NextResponse.json({ ok: true }), trace, "modal-request-1");
    expect(response.headers.get("x-correlation-id")).toBe(trace.puleiroTraceId);
    expect(response.headers.get("x-operation-id")).toBe(trace.operationId);
    expect(response.headers.get("x-request-id")).toBe(trace.requestId);
    expect(response.headers.get("x-modal-request-id")).toBe("modal-request-1");
  });

  it("descarta campos sensíveis dos logs estruturados", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mascotLog("pose_request_received", {
      requestId: "request-1",
      jobId: "job-1",
      token: "secret-token",
      cookie: "secret-cookie",
      image: "base64-data",
    });
    const payload = JSON.parse(String(log.mock.calls[0][0]));
    expect(payload).toMatchObject({ service: "puleiro-bff", event: "pose_request_received", requestId: "request-1" });
    expect(payload).not.toHaveProperty("token");
    expect(payload).not.toHaveProperty("cookie");
    expect(payload).not.toHaveProperty("image");
  });

  it("identifica Preview como staging, sem depender de NODE_ENV", () => {
    vi.stubEnv("GRU_MASCOT_ENV", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    expect(mascotObservabilityEnvironment()).toBe("staging");
    vi.unstubAllEnvs();
  });
});
