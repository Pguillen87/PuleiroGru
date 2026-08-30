import { afterEach, describe, expect, it, vi } from "vitest";
import { createGenerationJob, createIncubation, deleteGenerationJob, hatchIncubation, pollGenerationJob, startPoseGeneration, updateMascotConfiguration } from "@/lib/mascot-generation/client";
import type { GenerationJob } from "@/lib/mascot-generation/types";

const job: GenerationJob = {
  id: "job-1",
  attemptId: "attempt-1234567890",
  status: "generating_poses",
  message: "Preparando as poses",
  generationScheduled: true,
  masters: [],
  subjectIdentity: { category: "human", label: "pessoa", confirmed: true },
  poseChoices: {
    normal: "normal_attentive",
    listening: "listening_focus",
    transcribing: "transcribing_fast",
  },
  configuration: {
    displayName: "Mascote GRU",
    poseChoices: {
      normal: "normal_attentive",
      listening: "listening_focus",
      transcribing: "transcribing_fast",
    },
    configurationRevision: 0,
  },
  poses: [],
};

describe("retomada durante consulta instável", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("timeout de leitura não envia novo POST nem transforma o job em falha", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const result = pollGenerationJob(job, {
      intervalMs: 1,
      timeoutMs: 20,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    });
    const assertion = expect(result).rejects.toMatchObject({
      message: expect.stringContaining("continua em andamento"),
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([, init]) => !init || !init.method || init.method === "GET")).toBe(true);
    expect(job.status).toBe("generating_poses");
  });

  it("erro seguro preserva o código de suporte", async () => {
    const response = new Response(JSON.stringify({
      message: "Não foi possível iniciar as poses agora.",
      code: "POSE_GENERATION_FAILED",
      supportCode: "ABC123",
    }), { status: 503, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const { startPoseGeneration } = await import("@/lib/mascot-generation/client");
    await expect(startPoseGeneration("job-1", job.poseChoices, new AbortController().signal))
      .rejects.toMatchObject({
        code: "POSE_GENERATION_FAILED",
        supportCode: "ABC123",
        message: expect.stringContaining("ABC123"),
      });
  });

  it("não remove a pessoa da conta por uma falha de autorização que não é sessão", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    const response = new Response(JSON.stringify({
      message: "Esta tentativa não pertence à sessão atual.",
      code: "ATTEMPT_MISMATCH",
    }), { status: 403, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(startPoseGeneration("job-1", job.poseChoices, new AbortController().signal))
      .rejects.toMatchObject({ code: "ATTEMPT_MISMATCH" });

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("solicita novo login somente quando o BFF confirma sessão expirada", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    const response = new Response(JSON.stringify({
      message: "Sua sessão terminou.",
      code: "SESSION_EXPIRED",
    }), { status: 401, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(startPoseGeneration("job-1", job.poseChoices, new AbortController().signal))
      .rejects.toMatchObject({ code: "SESSION_EXPIRED" });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("uma nova foto declara uma tentativa nova sem alterar a retomada padrão", async () => {
    const response = new Response(JSON.stringify({ job }), { status: 201, headers: { "content-type": "application/json" } });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const photo = new File(["image"], "nova.jpg", { type: "image/jpeg" });
    await createGenerationJob(photo, job.subjectIdentity, new AbortController().signal, true);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ "X-Puleiro-New-Attempt": "true" });
  });

  it("salva configuração por PATCH sem reutilizar o POST publicado de poses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ job }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await updateMascotConfiguration("job-1", { displayName: "Paulinho", configurationRevision: 0 }, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledWith("/api/mascot/jobs/job-1/configuration", expect.objectContaining({ method: "PATCH" }));
  });

  it("registra a incubação com chave estável e exatamente três escolhas", async () => {
    const asyncJob = { ...job, workflowMode: "async_incubator_v1" as const, productState: "PREPARING" as const };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ job: asyncJob }), { status: 202, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const photo = new File(["image"], "arara.png", { type: "image/png" });
    const key = "4ba7e9e6-b83f-4d77-9f5d-8ce1a0db0b62";
    await createIncubation(photo, { category: "animal", label: "arara", species: "arara", confirmed: true }, job.poseChoices, undefined, key, new AbortController().signal);
    const [, request] = fetchMock.mock.calls[0]!;
    const form = request.body as FormData;
    expect(request.headers).toEqual({ "X-Puleiro-Incubation-Key": key });
    expect(JSON.parse(String(form.get("poseChoices")))).toEqual(job.poseChoices);
  });

  it("chocar é uma mutação separada e não envia configuração nem foto", async () => {
    const asyncJob = { ...job, workflowMode: "async_incubator_v1" as const, productState: "HATCHED" as const };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ job: asyncJob }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await hatchIncubation("job-1", new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledWith("/api/mascot/incubations/job-1/hatch", expect.objectContaining({ method: "POST", body: "{}" }));
  });

  it("só aceita a confirmação explícita da exclusão do BFF", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 202, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteGenerationJob("job-1", new AbortController().signal)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/mascot/jobs/job-1", expect.objectContaining({ method: "DELETE" }));
  });
});
