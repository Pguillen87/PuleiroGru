import { describe, expect, it, vi } from "vitest";
import { IncubationRecoveryError, recoverIncubationJob, resolveIncubationCreation } from "@/lib/mascot-generation/incubation-recovery";
import type { GenerationJob } from "@/lib/mascot-generation/types";

const job = (id = "job-1"): GenerationJob => ({
  id,
  attemptId: "incubator-attempt-1",
  status: "registered",
  message: "registrado",
  generationScheduled: true,
  masters: [],
  subjectIdentity: { category: "animal", label: "Arara", species: "arara", confirmed: true },
  poseChoices: { normal: "normal-ready", listening: "listening-ready", transcribing: "transcribing-ready" },
  configuration: { displayName: "", poseChoices: { normal: "normal-ready", listening: "listening-ready", transcribing: "transcribing-ready" }, configurationRevision: 0 },
  poses: [],
});

describe("resolveIncubationCreation", () => {
  it("recupera o job quando Modal criou o registro mas a resposta foi perdida", async () => {
    const created = job();
    const getJobByAttempt = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created);
    const create = vi.fn().mockRejectedValue(new TypeError("connection reset after response"));
    const persist = vi.fn();

    await expect(resolveIncubationCreation({
      attemptId: created.attemptId, existingJobId: null, canCreate: true, getJob: vi.fn(), getJobByAttempt, create, persist,
    })).resolves.toMatchObject({ job: { id: created.id }, recovered: true });

    expect(create).toHaveBeenCalledTimes(1);
    expect(getJobByAttempt).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("reconcilia timeout sem uma segunda createIncubation", async () => {
    const created = job("job-timeout");
    const create = vi.fn().mockRejectedValue(new TypeError("timeout"));
    const getJobByAttempt = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created);
    await resolveIncubationCreation({
      attemptId: created.attemptId, existingJobId: null, canCreate: true, getJob: vi.fn(), getJobByAttempt, create, persist: vi.fn(),
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("reutiliza o job persistido e o mesmo job encontrado no replay", async () => {
    const existing = job("job-existing");
    const create = vi.fn();
    const persist = vi.fn();
    const result = await resolveIncubationCreation({
      attemptId: existing.attemptId,
      existingJobId: existing.id,
      canCreate: false,
      getJob: vi.fn().mockResolvedValue(existing),
      getJobByAttempt: vi.fn(),
      create,
      persist,
    });
    expect(result).toMatchObject({ job: { id: existing.id }, recovered: true });
    expect(create).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(existing);
  });

  it("não cria um segundo job quando uma solicitação concorrente encontra a reserva", async () => {
    const create = vi.fn();
    await expect(resolveIncubationCreation({
      attemptId: "incubator-attempt-1",
      existingJobId: null,
      canCreate: false,
      getJob: vi.fn(),
      getJobByAttempt: vi.fn().mockResolvedValue(null),
      create,
      persist: vi.fn(),
    })).rejects.toMatchObject({ code: "INCUBATION_CREATION_IN_PROGRESS" });
    expect(create).not.toHaveBeenCalled();
  });

  it("não recupera um job de outro owner quando o lookup owner-scoped não o retorna", async () => {
    const create = vi.fn();
    await expect(resolveIncubationCreation({
      attemptId: "incubator-attempt-1",
      existingJobId: null,
      canCreate: false,
      getJob: vi.fn(),
      getJobByAttempt: vi.fn().mockResolvedValue(null),
      create,
      persist: vi.fn(),
    })).rejects.toBeInstanceOf(IncubationRecoveryError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("recoverIncubationJob", () => {
  it("recupera e persiste um job do mesmo attempt quando o vínculo está ausente", async () => {
    const existing = job("job-real-registered");
    const getJob = vi.fn();
    const getJobByAttempt = vi.fn().mockResolvedValue(existing);
    const persist = vi.fn();

    await expect(recoverIncubationJob({
      attemptId: existing.attemptId,
      existingJobId: null,
      getJob,
      getJobByAttempt,
      persist,
    })).resolves.toBe(existing);

    expect(getJob).not.toHaveBeenCalled();
    expect(getJobByAttempt).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(existing);
  });

  it("não cria nem persiste quando Modal não encontra o job", async () => {
    const persist = vi.fn();
    await expect(recoverIncubationJob({
      attemptId: "incubator-attempt-1",
      existingJobId: null,
      getJob: vi.fn(),
      getJobByAttempt: vi.fn().mockResolvedValue(null),
      persist,
    })).resolves.toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejeita um job retornado para outro attempt sem persistir", async () => {
    const persist = vi.fn();
    const wrong = { ...job("job-wrong"), attemptId: "other-attempt" };
    await expect(recoverIncubationJob({
      attemptId: "incubator-attempt-1",
      existingJobId: null,
      getJob: vi.fn(),
      getJobByAttempt: vi.fn().mockResolvedValue(wrong),
      persist,
    })).rejects.toMatchObject({ code: "INCUBATION_JOB_UNAVAILABLE" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("usa o vínculo existente sem lookup por attempt ou nova criação", async () => {
    const existing = job("job-linked");
    const getJobByAttempt = vi.fn();
    const create = vi.fn();
    await expect(recoverIncubationJob({
      attemptId: existing.attemptId,
      existingJobId: existing.id,
      getJob: vi.fn().mockResolvedValue(existing),
      getJobByAttempt,
      persist: create,
    })).resolves.toBe(existing);
    expect(getJobByAttempt).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("não aceita vínculo existente para outro attempt", async () => {
    const wrong = { ...job("job-linked"), attemptId: "other-attempt" };
    await expect(recoverIncubationJob({
      attemptId: "incubator-attempt-1",
      existingJobId: "job-linked",
      getJob: vi.fn().mockResolvedValue(wrong),
      getJobByAttempt: vi.fn(),
      persist: vi.fn(),
    })).rejects.toBeInstanceOf(IncubationRecoveryError);
  });
});
