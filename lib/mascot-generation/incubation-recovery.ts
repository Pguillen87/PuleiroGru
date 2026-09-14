import { createHash } from "node:crypto";
import type { GenerationJob } from "./types";
import { ModalProviderError, type ModalJobLookup } from "./modal-provider";
import type { JobIdentity, MascotGenerationProvider } from "./types";

export class IncubationRecoveryError extends Error {
  constructor(
    readonly code: "INCUBATION_CREATION_IN_PROGRESS" | "INCUBATION_JOB_UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

export type IncubationCreationDependencies = {
  attemptId: string;
  existingJobId: string | null;
  canCreate: boolean;
  getJob: (jobId: string) => Promise<GenerationJob | null>;
  getJobByAttempt: () => Promise<GenerationJob | null>;
  create: () => Promise<GenerationJob>;
  persist: (job: GenerationJob) => Promise<void>;
};

export type IncubationJobRecoveryDependencies = {
  attemptId: string;
  existingJobId: string | null;
  getJob: (jobId: string) => Promise<GenerationJob | null>;
  getJobByAttempt: () => Promise<GenerationJob | null>;
  persist: (job: GenerationJob) => Promise<void>;
};

type LookupProvider = Pick<MascotGenerationProvider, "getJob"> & {
  lookupJob?: (jobId: string, identity: JobIdentity) => Promise<ModalJobLookup>;
};

export async function lookupIncubationJob(provider: LookupProvider, jobId: string, identity: JobIdentity): Promise<ModalJobLookup> {
  try {
    if (provider.lookupJob) return await provider.lookupJob(jobId, identity);
    const job = await provider.getJob(jobId, identity);
    return job ? { kind: "found", job } : { kind: "not_found" };
  } catch (error) {
    const typed = error instanceof ModalProviderError
      ? error
      : new ModalProviderError(503, "INCUBATION_PROVIDER_UNAVAILABLE", "O serviço de mascotes está temporariamente indisponível.");
    return { kind: "unavailable", error: typed };
  }
}

export function safeIncubationJobId(jobId: string) {
  return `job_${createHash("sha256").update(jobId).digest("hex").slice(0, 16)}`;
}

/**
 * Reconciles a previously registered owner-scoped attempt without creating
 * anything. Missing links are repaired only from the same attempt identity.
 */
export async function recoverIncubationJob(
  dependencies: IncubationJobRecoveryDependencies,
): Promise<GenerationJob | null> {
  if (dependencies.existingJobId) {
    const job = await dependencies.getJob(dependencies.existingJobId);
    if (!job) return null;
    await assertExpectedAttempt(dependencies.attemptId, job);
    return job;
  }

  const job = await dependencies.getJobByAttempt();
  if (!job) return null;
  await assertExpectedAttempt(dependencies.attemptId, job);
  await dependencies.persist(job);
  return job;
}

/**
 * Resolves a durable Modal job before creating one. Only the request that
 * inserted the owner-scoped attempt may call create; all replays reconcile.
 */
export async function resolveIncubationCreation(
  dependencies: IncubationCreationDependencies,
): Promise<{ job: GenerationJob; recovered: boolean }> {
  if (dependencies.existingJobId) {
    const job = await dependencies.getJob(dependencies.existingJobId);
    if (!job) {
      throw new IncubationRecoveryError("INCUBATION_JOB_UNAVAILABLE", "O nascimento registrado ainda não está disponível.");
    }
    await persistExpectedAttempt(dependencies, job);
    return { job, recovered: true };
  }

  const discovered = await dependencies.getJobByAttempt();
  if (discovered) {
    await persistExpectedAttempt(dependencies, discovered);
    return { job: discovered, recovered: true };
  }

  if (!dependencies.canCreate) {
    throw new IncubationRecoveryError("INCUBATION_CREATION_IN_PROGRESS", "O nascimento está sendo confirmado. Tente retomar em instantes.");
  }

  try {
    const job = await dependencies.create();
    await persistExpectedAttempt(dependencies, job);
    return { job, recovered: false };
  } catch (error) {
    if (!isAmbiguousCreationFailure(error)) throw error;
    const recovered = await dependencies.getJobByAttempt();
    if (!recovered) throw error;
    await persistExpectedAttempt(dependencies, recovered);
    return { job: recovered, recovered: true };
  }
}

async function persistExpectedAttempt(dependencies: IncubationCreationDependencies, job: GenerationJob) {
  await assertExpectedAttempt(dependencies.attemptId, job);
  await dependencies.persist(job);
}

async function assertExpectedAttempt(attemptId: string, job: GenerationJob) {
  if (job.attemptId !== attemptId) {
    throw new IncubationRecoveryError("INCUBATION_JOB_UNAVAILABLE", "O nascimento retornado não corresponde à tentativa registrada.");
  }
}

function isAmbiguousCreationFailure(error: unknown) {
  if (!(error instanceof ModalProviderError)) return true;
  return ![400, 401, 403, 409, 422].includes(error.status);
}
