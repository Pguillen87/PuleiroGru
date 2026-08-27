import { describe, expect, it } from "vitest";
import { isDeletableAttemptStatus, isResumableAttemptStatus } from "@/lib/mascot-generation/attempt-store";

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
