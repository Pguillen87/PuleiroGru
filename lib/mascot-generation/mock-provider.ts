import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generationConfig } from "./config";
import type { CreateMasterJobInput, GenerationJob, JobIdentity, MascotGenerationProvider, PoseChoices } from "./types";
import { DEFAULT_POSE_CHOICES, POSE_CATALOG_VERSION, POSE_OPTIONS } from "./pose-catalog";

type MockRecord = { createdAt: number; ownerId: string; job: GenerationJob };
const globalStore = globalThis as typeof globalThis & { __puleiroMockJobs?: Map<string, MockRecord> };
const jobs = globalStore.__puleiroMockJobs ?? new Map<string, MockRecord>();
globalStore.__puleiroMockJobs = jobs;

export class MockMascotGenerationProvider implements MascotGenerationProvider {
  async getCapabilities() {
    const catalog = (role: "normal" | "listening" | "transcribing") =>
      POSE_OPTIONS.filter((option) => option.role === role).map((option) => option.id);
    return {
      contractVersion: "v2" as const,
      master: { ready: generationConfig.masterGenerationEnabled, modelVersion: "mock-v1", promptVersion: "master-v4", reasons: generationConfig.masterGenerationEnabled ? [] : ["GENERATION_DISABLED"] },
      poses: { ready: generationConfig.poseGenerationEnabled, workerVersion: "mock-v1", catalogVersion: POSE_CATALOG_VERSION, templateVersion: POSE_CATALOG_VERSION, reasons: generationConfig.poseGenerationEnabled ? [] : ["GENERATION_DISABLED"] },
      poseCatalog: { normal: catalog("normal"), listening: catalog("listening"), transcribing: catalog("transcribing") },
    };
  }
  async createMasterJob(input: CreateMasterJobInput) {
    const existing = [...jobs.values()].find(
      ({ ownerId, job }) => ownerId === input.ownerId && job.attemptId === input.attemptId,
    );
    if (existing) return existing.job;
    const id = crypto.randomUUID();
    const job: GenerationJob = {
      id,
      attemptId: input.attemptId,
      status: "queued",
      message: "Foto recebida. Preparando o nascimento…",
      generationScheduled: false,
      masters: [],
      subjectIdentity: input.subjectIdentity,
      poseChoices: DEFAULT_POSE_CHOICES,
      poses: [],
    };
    jobs.set(id, { createdAt: Date.now(), ownerId: input.ownerId, job });
    return job;
  }

  async startMasterGeneration(jobId: string, identity: JobIdentity) {
    const record = jobs.get(jobId);
    if (!record || record.ownerId !== identity.ownerId) throw new Error("Nascimento não encontrado.");
    record.createdAt = Date.now();
    record.job = { ...record.job, status: "queued", generationScheduled: true };
    return record.job;
  }

  async getJob(jobId: string, identity: JobIdentity) {
    const record = jobs.get(jobId);
    if (!record || record.ownerId !== identity.ownerId) return null;
    if (record.job.status === "generating_poses" && Date.now() - record.createdAt >= generationConfig.mockDelayMs) {
      const bytes = await readFile(join(process.cwd(), "public", "assets", "puleiro-reveal.jpg"));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      record.job = {
        ...record.job,
        status: "awaiting_set_approval",
        message: "As três poses estão prontas para revisão.",
        poses: (["normal", "listening", "transcribing"] as const).map((role, index) => ({
          id: `pose_0${index + 1}`,
          role,
          optionId: record.job.poseChoices[role],
          label: role,
          imageUrl: "/assets/puleiro-reveal.jpg",
          sha256,
          size: bytes.byteLength,
          templateVersion: POSE_CATALOG_VERSION,
          qc: { status: "passed" as const, safe_reasons: [], alpha_ratio: 0.5, border_opaque_ratio: 0, foreground_components: 1, width: 1024, height: 1024 },
        })),
      };
    }
    if (["master_approved", "generating_poses", "awaiting_set_approval", "failed", "canceled"].includes(record.job.status)) {
      return record.job;
    }
    if (Date.now() - record.createdAt < generationConfig.mockDelayMs) {
      return { ...record.job, status: "generating_masters" as const, message: "Criando o mascote mestre…" };
    }
    return {
      ...record.job,
      status: "awaiting_master_approval" as const,
      message: "Escolha o mascote mestre que mais combina com você.",
      masters: ["1", "2", "3"].map((suffix) => ({
        id: `mock-master-${suffix}`,
        imageUrl: "/assets/puleiro-reveal.jpg",
      })),
    };
  }

  async getJobByAttempt(identity: JobIdentity) {
    const record = [...jobs.values()].find(
      ({ ownerId, job }) => ownerId === identity.ownerId && job.attemptId === identity.attemptId,
    );
    return record ? this.getJob(record.job.id, identity) : null;
  }

  async approveMaster(jobId: string, masterId: string, identity: JobIdentity) {
    const job = await this.getJob(jobId, identity);
    if (!job || !job.masters.some(({ id }) => id === masterId)) throw new Error("Master não encontrado.");
    const approved = { ...job, status: "master_approved" as const, approvedMasterId: masterId };
    const record = jobs.get(jobId);
    if (record) record.job = approved;
    return approved;
  }

  async startPoseGeneration(jobId: string, choices: PoseChoices, identity: JobIdentity) {
    const job = await this.getJob(jobId, identity);
    if (!job || job.status !== "master_approved") throw new Error("Aprove o mascote mestre antes das poses.");
    const generating = { ...job, status: "generating_poses" as const, poseChoices: choices };
    const record = jobs.get(jobId);
    if (record) {
      record.createdAt = Date.now();
      record.job = generating;
    }
    return generating;
  }

  async getPoseImage() {
    const bytes = await readFile(join(process.cwd(), "public", "assets", "puleiro-reveal.jpg"));
    return { bytes: new Uint8Array(bytes), contentType: "image/jpeg" as const };
  }
}
