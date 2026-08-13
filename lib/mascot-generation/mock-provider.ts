import "server-only";
import { generationConfig } from "./config";
import type { CreateMasterJobInput, GenerationJob, MascotGenerationProvider } from "./types";

type MockRecord = { createdAt: number; job: GenerationJob };

const globalStore = globalThis as typeof globalThis & { __puleiroMockJobs?: Map<string, MockRecord> };
const jobs = globalStore.__puleiroMockJobs ?? new Map<string, MockRecord>();
globalStore.__puleiroMockJobs = jobs;

export class MockMascotGenerationProvider implements MascotGenerationProvider {
  async createMasterJob(input: CreateMasterJobInput): Promise<GenerationJob> {
    const id = crypto.randomUUID();
    const job: GenerationJob = {
      id,
      status: "queued",
      message: "Foto recebida. Preparando o nascimento…",
    };
    jobs.set(id, { createdAt: Date.now(), job });
    void input.bytes.byteLength;
    return job;
  }

  async getJob(jobId: string): Promise<GenerationJob | null> {
    const record = jobs.get(jobId);
    if (!record) return null;
    if (Date.now() - record.createdAt < generationConfig.mockDelayMs) {
      return { ...record.job, status: "processing", message: "Criando o mascote mestre…" };
    }
    return {
      ...record.job,
      status: "succeeded",
      message: "Seu mascote está pronto.",
      masterImageUrl: "/assets/puleiro-reveal.jpg",
    };
  }
}
