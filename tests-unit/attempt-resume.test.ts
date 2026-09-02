import { describe, expect, it } from "vitest";
import { incubationProductState, isDeletableAttemptStatus, isResumableAttemptStatus, prioritizeAttempt, projectedIncubationProductState, type MascotAttempt } from "@/lib/mascot-generation/attempt-store";

describe("isResumableAttemptStatus", () => {
  it("não retoma um mascote já guardado ou cancelado", () => {
    expect(isResumableAttemptStatus("ready")).toBe(false);
    expect(isResumableAttemptStatus("canceled")).toBe(false);
  });

  it("retoma trabalhos que ainda exigem continuidade", () => {
    expect(isResumableAttemptStatus("generating_masters")).toBe(true);
    expect(isResumableAttemptStatus("awaiting_master_approval")).toBe(true);
    expect(isResumableAttemptStatus("generating_poses")).toBe(true);
    expect(isResumableAttemptStatus("failed")).toBe(true);
  });
});

describe("isDeletableAttemptStatus", () => {
  it("permite apagar somente registros sem geração iniciada", () => {
    expect(isDeletableAttemptStatus("registered")).toBe(true);
    expect(isDeletableAttemptStatus("awaiting_generation_authorization")).toBe(true);
  });

  it("preserva masters e pacotes que já avançaram no fluxo", () => {
    expect(isDeletableAttemptStatus("awaiting_master_approval")).toBe(false);
    expect(isDeletableAttemptStatus("master_approved")).toBe(false);
    expect(isDeletableAttemptStatus("ready")).toBe(false);
  });
});

describe("prioritizeAttempt", () => {
  const attempt = (attemptId: string): MascotAttempt => ({
    id: attemptId,
    user_id: "user-1",
    attempt_id: attemptId,
    modal_job_id: `job-${attemptId}`,
    status: "registered",
    selected_master_id: null,
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
  });

  it("prioriza o cookie sem descartar candidatos seguintes", () => {
    const ordered = prioritizeAttempt([attempt("newer"), attempt("cookie"), attempt("master")], "cookie");
    expect(ordered.map((item) => item.attempt_id)).toEqual(["cookie", "newer", "master"]);
  });
});

describe("incubationProductState", () => {
  const attempt = (overrides: Partial<MascotAttempt>): MascotAttempt => ({
    id: "row-1", user_id: "user-1", attempt_id: "incubator-1", modal_job_id: "job-1",
    status: "registered", selected_master_id: null,
    created_at: "2026-08-29T00:00:00Z", updated_at: "2026-08-29T00:00:00Z",
    workflow_mode: "async_incubator_v1", ...overrides,
  });

  it("deriva preparação, incubação, hatch e pacote sem uma segunda coluna de estado", () => {
    expect(incubationProductState(attempt({ status: "registered" }))).toBe("PREPARING");
    expect(incubationProductState(attempt({ status: "generating_poses" }))).toBe("INCUBATING");
    expect(incubationProductState(attempt({ status: "awaiting_set_approval", generation_ready_at: "2026-08-29T01:00:00Z" }))).toBe("READY_TO_HATCH");
    expect(incubationProductState(attempt({ status: "awaiting_set_approval", generation_ready_at: "2026-08-29T01:00:00Z", hatched_at: "2026-08-29T02:00:00Z" }))).toBe("HATCHED");
    expect(incubationProductState(attempt({ status: "ready" }))).toBe("PACKAGE_READY");
    expect(incubationProductState(attempt({ status: "failed" }))).toBe("FAILED");
  });

  it("mantém o hatch Web acima de um estado Modal atrasado", () => {
    const hatched = attempt({
      status: "awaiting_set_approval",
      generation_ready_at: "2026-08-29T01:00:00Z",
      hatched_at: "2026-08-29T02:00:00Z",
    });
    expect(projectedIncubationProductState(hatched, "READY_TO_HATCH")).toBe("HATCHED");
    expect(projectedIncubationProductState(attempt({ status: "ready", hatched_at: "2026-08-29T02:00:00Z" }), "HATCHED")).toBe("PACKAGE_READY");
  });

  it("não projeta pronto quando o Modal informa conjunto incompleto", () => {
    const job = {
      poses: [],
      poseSetQc: undefined,
    } as never;
    expect(projectedIncubationProductState(
      attempt({ status: "awaiting_set_approval", generation_ready_at: "2026-08-29T01:00:00Z" }),
      "READY_TO_HATCH",
      job,
    )).toBe("INCUBATING");
  });

  it("projeta pronto somente com as três roles e QC v3 aprovado", () => {
    const job = {
      poses: [{ role: "normal" }, { role: "listening" }, { role: "transcribing" }],
      poseSetQc: { status: "passed", version: "pose-set-visual-v3" },
    } as never;
    expect(projectedIncubationProductState(
      attempt({ status: "awaiting_set_approval", generation_ready_at: "2026-08-29T01:00:00Z" }),
      "READY_TO_HATCH",
      job,
    )).toBe("READY_TO_HATCH");
  });
});
