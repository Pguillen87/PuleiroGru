import { describe, expect, it } from "vitest";
import { MockMascotGenerationProvider } from "@/lib/mascot-generation/mock-provider";

const image = { bytes: new Uint8Array([1]), contentType: "image/jpeg" as const };
const subjectIdentity = { category: "human" as const, label: "pessoa", confirmed: true as const };

describe("jobs owner-scoped e retomáveis", () => {
  it("reaproveita o mesmo job para owner e attemptId", async () => {
    const provider = new MockMascotGenerationProvider();
    const input = { ...image, subjectIdentity, ownerId: "owner-a", attemptId: crypto.randomUUID(), correlationId: crypto.randomUUID(), idempotencyKey: "register-1" };
    const first = await provider.createMasterJob(input);
    const second = await provider.createMasterJob({ ...input, idempotencyKey: "register-2" });
    expect(second.id).toBe(first.id);
    await expect(provider.getJobByAttempt(input)).resolves.toMatchObject({ id: first.id });
  });

  it("não permite descoberta por outro owner", async () => {
    const provider = new MockMascotGenerationProvider();
    const input = { ...image, subjectIdentity, ownerId: "owner-a", attemptId: crypto.randomUUID(), correlationId: crypto.randomUUID(), idempotencyKey: "register" };
    const job = await provider.createMasterJob(input);
    await expect(provider.getJob(job.id, { ...input, ownerId: "owner-b" })).resolves.toBeNull();
  });

  it("exclui somente o job da tentativa e do owner correspondente", async () => {
    const provider = new MockMascotGenerationProvider();
    const input = { ...image, subjectIdentity, ownerId: "owner-a", attemptId: crypto.randomUUID(), correlationId: crypto.randomUUID(), idempotencyKey: "register" };
    const job = await provider.createMasterJob(input);
    await expect(provider.deleteJob(job.id, { ...input, attemptId: crypto.randomUUID() })).rejects.toThrow("Nascimento não encontrado");
    await expect(provider.deleteJob(job.id, input)).resolves.toEqual({ deleted: true, idempotentReplay: false });
    await expect(provider.getJob(job.id, input)).resolves.toBeNull();
  });
});
