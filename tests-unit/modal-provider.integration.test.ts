import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

describe("BFF → Modal v2 local sem GPU", () => {
  let server: Server;
  let baseUrl = "";
  let registrationCalls = 0;
  const secret = "integration-secret-".padEnd(48, "x");

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const token = request.headers.authorization?.slice(7) ?? "";
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "puleiro-bff", audience: "gru-modal" });
      const url = new URL(request.url ?? "/", "http://local");
      if (request.method === "POST" && url.pathname === "/v2/mascot/jobs") registrationCalls += 1;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        jobId: "job-local-1",
        attemptId: payload.attempt_id,
        status: "registered",
        generationScheduled: false,
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor local indisponível");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it("registra, consulta e retoma sem endpoint de geração", async () => {
    vi.stubEnv("MODAL_MASCOT_API_URL", baseUrl);
    vi.stubEnv("MODAL_BFF_JWT_SECRET", secret);
    vi.resetModules();
    const { ModalMascotGenerationProvider } = await import("@/lib/mascot-generation/modal-provider");
    const provider = new ModalMascotGenerationProvider();
    const identity = { ownerId: "owner-local", attemptId: "attempt-local-123456", correlationId: crypto.randomUUID() };
    const created = await provider.createMasterJob({
      ...identity,
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
      idempotencyKey: "register:owner-local:attempt-local-123456",
    });
    const read = await provider.getJob(created.id, identity);
    const resumed = await provider.getJobByAttempt(identity);
    expect(created).toMatchObject({ status: "registered", generationScheduled: false });
    expect(read?.id).toBe(created.id);
    expect(resumed?.attemptId).toBe(identity.attemptId);
    expect(registrationCalls).toBe(1);
    expect({ gpuCalls: 0, masterGenerationCalls: 0, poseGenerationCalls: 0 }).toEqual({ gpuCalls: 0, masterGenerationCalls: 0, poseGenerationCalls: 0 });
  });
});
