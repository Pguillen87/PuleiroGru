import { describe, expect, it, vi } from "vitest";
import { IncubationRecoveryError, resolveIncubationCreation } from "@/lib/mascot-generation/incubation-recovery";
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
