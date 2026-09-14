import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findIncubationRecovery,
  markIncubationJobMissing,
  retireIncubationAttempt,
} from "@/lib/mascot-generation/incubation-recovery-store";

describe("incubation recovery store", () => {
  it("registra a ausência do job owner-scoped", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { status: "CONFIRMED_MISSING", error_code: "INCUBATION_JOB_GONE" }, error: null }),
    });
    const insert = vi.fn().mockReturnValue({ select });
    const client = { from: vi.fn().mockImplementation((table: string) => table === "mascot_incubation_recovery"
      ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }), insert }
      : {}) } as unknown as SupabaseClient;
    await expect(markIncubationJobMissing(client, "owner", "attempt", "job")).resolves.toMatchObject({ status: "CONFIRMED_MISSING" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner", attempt_id: "attempt", modal_job_id: "job", status: "CONFIRMED_MISSING" }));
  });

  it("não reabre um nascimento que já foi retirado", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: {
      id: "recovery-1", user_id: "owner", attempt_id: "attempt", modal_job_id: "job", status: "RETIRED",
      error_code: "INCUBATION_JOB_GONE", first_observed_at: "2026-09-14T12:00:00Z", last_observed_at: "2026-09-14T12:00:00Z",
      retired_at: "2026-09-14T12:01:00Z", created_at: "2026-09-14T12:00:00Z", updated_at: "2026-09-14T12:01:00Z",
    }, error: null });
    const insert = vi.fn();
    const client = { from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }), insert }) } as unknown as SupabaseClient;
    await expect(markIncubationJobMissing(client, "owner", "attempt", "job")).resolves.toMatchObject({ status: "RETIRED" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("não trata falha de leitura como ausência", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST500" } });
    const client = { from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }) } as unknown as SupabaseClient;
    await expect(findIncubationRecovery(client, "owner", "attempt")).rejects.toThrow("Não foi possível consultar a recuperação");
  });

  it("retira a tentativa de forma idempotente e preserva o registro", async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { status: "RETIRED", retired_at: "2026-09-14T12:00:00.000Z" }, error: null });
    const builder = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle };
    const client = { from: vi.fn().mockReturnValue(builder) } as unknown as SupabaseClient;
    await expect(retireIncubationAttempt(client, "owner", "attempt", "job")).resolves.toMatchObject({ status: "RETIRED" });
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("cria um registro de retirada para uma falha sem apagar a tentativa", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const insertedRow = {
      id: "recovery-2", user_id: "owner", attempt_id: "attempt", modal_job_id: "job", status: "RETIRED",
      error_code: "POSE_GENERATION_FAILED", first_observed_at: "2026-09-14T12:00:00Z", last_observed_at: "2026-09-14T12:00:00Z",
      retired_at: "2026-09-14T12:00:00Z", created_at: "2026-09-14T12:00:00Z", updated_at: "2026-09-14T12:00:00Z",
    };
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const findQuery = { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) };
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const client = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(findQuery), insert }) } as unknown as SupabaseClient;
    await expect(retireIncubationAttempt(client, "owner", "attempt", "job", "POSE_GENERATION_FAILED")).resolves.toMatchObject({ status: "RETIRED" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "owner", attempt_id: "attempt", modal_job_id: "job", status: "RETIRED", error_code: "POSE_GENERATION_FAILED",
    }));
  });
});
