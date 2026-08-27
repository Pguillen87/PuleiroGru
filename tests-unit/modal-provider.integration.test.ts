import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

describe("BFF → Modal v2 local sem GPU", () => {
  let server: Server;
  let baseUrl = "";
  let registrationCalls = 0;
  let masterGenerationCalls = 0;
  let approvalCalls = 0;
  let deletionCalls = 0;
  let poseHttpCalls = 0;
  let poseWorkerReservations = 0;
  let approvalIdempotencyKey = "";
  let reservedPoseKey = "";
  const secret = "integration-secret-".padEnd(48, "x");

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const token = request.headers.authorization?.slice(7) ?? "";
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "puleiro-bff", audience: "gru-modal" });
      const url = new URL(request.url ?? "/", "http://local");
      if (request.method === "POST" && url.pathname === "/v2/mascot/jobs") registrationCalls += 1;
      if (request.method === "POST" && url.pathname === "/v2/mascot/jobs/job-local-1/master-generations") masterGenerationCalls += 1;
      if (request.method === "POST" && url.pathname === "/v2/mascot/jobs/job-local-1/masters/master_1/approve") {
        approvalCalls += 1;
        approvalIdempotencyKey = String(request.headers["x-idempotency-key"] ?? "");
      }
      if (request.method === "DELETE" && url.pathname === "/v2/mascot/jobs/job-local-1") deletionCalls += 1;
      let operationId = String(request.headers["x-operation-id"] ?? "");
      let idempotentReplay = false;
      if (request.method === "POST" && url.pathname === "/v2/mascot/jobs/job-local-1/pose-generations") {
        poseHttpCalls += 1;
        const key = String(request.headers["x-idempotency-key"] ?? "");
        if (!reservedPoseKey) {
          reservedPoseKey = key;
          poseWorkerReservations += 1;
          operationId = "pose-operation-1";
        } else {
          expect(key).toBe(reservedPoseKey);
          operationId = "pose-operation-1";
          idempotentReplay = true;
        }
      }
      response.setHeader("X-Request-ID", `modal-request-${poseHttpCalls + registrationCalls}`);
      if (operationId) response.setHeader("X-Operation-ID", operationId);
      response.setHeader("Content-Type", "application/json");
      if (request.method === "DELETE" && url.pathname === "/v2/mascot/jobs/job-local-1") {
        response.end(JSON.stringify({ deleted: true, idempotent_replay: false }));
        return;
      }
      response.end(JSON.stringify({
        jobId: "job-local-1",
        attemptId: payload.attempt_id,
        status: "registered",
        generationScheduled: false,
        operationId: operationId || undefined,
        idempotentReplay,
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor local indisponível");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it("registra, autoriza Masters, consulta e retoma sem poses", async () => {
    vi.stubEnv("MODAL_MASCOT_API_URL", baseUrl);
    vi.stubEnv("MODAL_BFF_JWT_SECRET", secret);
    vi.resetModules();
    const { ModalMascotGenerationProvider } = await import("@/lib/mascot-generation/modal-provider");
    const provider = new ModalMascotGenerationProvider();
    const identity = {
      ownerId: "owner-local",
      attemptId: "attempt-local-123456",
      correlationId: crypto.randomUUID(),
      operationId: "bff-operation-1",
      requestId: "bff-request-1",
    };
    const created = await provider.createMasterJob({
      ...identity,
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
      idempotencyKey: "register:owner-local:attempt-local-123456",
      subjectIdentity: { category: "human", label: "pessoa", confirmed: true },
    });
    const scheduled = await provider.startMasterGeneration(created.id, identity);
    const read = await provider.getJob(created.id, identity);
    const resumed = await provider.getJobByAttempt(identity);
    await provider.approveMaster(created.id, "master_1", identity);
    const poseChoices = {
      normal: "normal_attentive",
      listening: "listening_focus",
      transcribing: "transcribing_fast",
    } as const;
    const firstPoseRequest = await provider.startPoseGeneration(created.id, poseChoices, identity);
    const replayPoseRequest = await provider.startPoseGeneration(created.id, poseChoices, {
      ...identity,
      operationId: "bff-operation-2",
      requestId: "bff-request-2",
    });
    const deleted = await provider.deleteJob(created.id, identity);
    expect(created).toMatchObject({ status: "registered", generationScheduled: false });
    expect(scheduled.id).toBe(created.id);
    expect(read?.id).toBe(created.id);
    expect(resumed?.attemptId).toBe(identity.attemptId);
    expect(registrationCalls).toBe(1);
    expect(approvalCalls).toBe(1);
    expect(approvalIdempotencyKey).toContain("approve:owner-local:attempt-local-123456:job-local-1:master_1");
    expect(firstPoseRequest.operationId).toBe("pose-operation-1");
    expect(replayPoseRequest).toMatchObject({ operationId: "pose-operation-1", idempotentReplay: true });
    expect(deleted).toEqual({ deleted: true, idempotentReplay: false });
    expect({ masterGenerationCalls, poseHttpCalls, poseWorkerReservations, poseWorkerCalls: 0 }).toEqual({
      masterGenerationCalls: 1,
      poseHttpCalls: 2,
      poseWorkerReservations: 1,
      poseWorkerCalls: 0,
    });
    expect(deletionCalls).toBe(1);
  });

  it("usa limites de espera próprios para registro, exclusão e leitura de retomada", async () => {
    const { modalRequestTimeoutMs } = await import("@/lib/mascot-generation/modal-provider");
    expect(modalRequestTimeoutMs("/v2/mascot/jobs", "POST")).toBe(35_000);
    expect(modalRequestTimeoutMs("/v2/mascot/jobs/job-local", "DELETE")).toBe(60_000);
    expect(modalRequestTimeoutMs("/v2/mascot/jobs?attempt_id=attempt-local", "GET")).toBe(20_000);
    expect(modalRequestTimeoutMs("/v2/mascot/jobs/job-local/pose-generations", "POST")).toBe(20_000);
  });
});
