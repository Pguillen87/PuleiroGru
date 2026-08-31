import type { GenerationCapabilities, GenerationJob, MascotConfiguration, PoseChoices, SubjectHint, SubjectIdentity, SubjectCategory } from "./types";
import { DEFAULT_POSE_CHOICES } from "./pose-catalog";

type JobResponse = { job?: GenerationJob | null; message?: string; code?: string; supportCode?: string; retryable?: boolean };

export class GenerationRequestError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
    readonly code = "REQUEST_FAILED",
    readonly supportCode?: string,
  ) {
    super(message);
  }
}

async function readResponse(response: Response, allowEmpty = false) {
  const body = await response.json().catch(() => ({})) as JobResponse;
  if (!response.ok || (!allowEmpty && !body.job)) {
    // Authorization failures from the generation workflow (ownership, origin,
    // or a stale attempt) are not proof that the browser session ended.
    // Only the BFF's explicit session code may return the person to the gate.
    if (response.status === 401 && body.code === "SESSION_EXPIRED") {
      globalThis.window?.dispatchEvent(new Event("puleiro:auth-required"));
    }
    throw new GenerationRequestError(
      safeSupportMessage(body.message ?? "O Puleiro não respondeu como esperado.", body.supportCode),
      body.retryable ?? response.status >= 500,
      body.code,
      body.supportCode,
    );
  }
  return body.job ? normalizeGenerationJob(body.job) : null;
}

function normalizeGenerationJob(job: GenerationJob): GenerationJob {
  // `configuration` was added to the v2 response without removing the older
  // top-level poseChoices field. Keep resumptions safe during a rolling
  // deployment and for already-published clients that only know the old shape.
  const poseChoices = job.poseChoices ?? job.configuration?.poseChoices ?? DEFAULT_POSE_CHOICES;
  return {
    ...job,
    masters: job.masters ?? [],
    poses: job.poses ?? [],
    poseChoices,
    configuration: job.configuration ?? {
      displayName: "Mascote GRU",
      poseChoices,
      configurationRevision: 0,
    },
  };
}

function safeSupportMessage(message: string, supportCode?: string) {
  return supportCode ? `${message} Código de suporte: ${supportCode}.` : message;
}

export async function createGenerationJob(photo: File, subjectIdentity: SubjectIdentity, signal: AbortSignal, startNewAttempt = false) {
  const formData = new FormData();
  formData.set("photo", photo);
  formData.set("subjectCategory", subjectIdentity.category);
  formData.set("subjectLabel", subjectIdentity.label);
  if (subjectIdentity.species) formData.set("subjectSpecies", subjectIdentity.species);
  const response = await fetch("/api/mascot/jobs", {
    method: "POST",
    headers: startNewAttempt ? { "X-Puleiro-New-Attempt": "true" } : undefined,
    body: formData,
    signal,
  });
  return await readResponse(response) as GenerationJob;
}

export async function finalizeMascot(jobId: string, displayName: string, signal: AbortSignal) {
  const response = await fetch(`/api/mascot/jobs/${encodeURIComponent(jobId)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
    signal,
  });
  const body = await response.json().catch(() => ({})) as { item?: import("./types").MascotLibraryItem; message?: string; code?: string; supportCode?: string };
  if (!response.ok || !body.item) {
    throw new GenerationRequestError(
      safeSupportMessage(body.message ?? "Não foi possível guardar este mascote agora.", body.supportCode),
      response.status >= 500,
      body.code,
      body.supportCode,
    );
  }
  return body.item;
}

export async function startPoseGeneration(jobId: string, poseChoices: PoseChoices, signal: AbortSignal) {
  const response = await fetch(
    `/api/mascot/jobs/${encodeURIComponent(jobId)}/pose-generations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poseChoices }),
      signal,
    },
  );
  return await readResponse(response) as GenerationJob;
}

export async function getGenerationCapabilities(signal: AbortSignal): Promise<GenerationCapabilities> {
  const response = await fetch("/api/mascot/capabilities", { cache: "no-store", signal });
  const body = await response.json().catch(() => ({})) as {
    capabilities?: GenerationCapabilities; message?: string; code?: string; supportCode?: string;
  };
  if (!response.ok || !body.capabilities) {
    throw new GenerationRequestError(
      safeSupportMessage(body.message ?? "Não foi possível conferir a oficina de poses.", body.supportCode),
      response.status >= 500,
      body.code ?? "CAPABILITIES_UNAVAILABLE",
      body.supportCode,
    );
  }
  return body.capabilities;
}

export async function startMasterGeneration(jobId: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/mascot/jobs/${encodeURIComponent(jobId)}/master-generations`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal },
  );
  return await readResponse(response) as GenerationJob;
}

export async function resumeGenerationJob(signal: AbortSignal) {
  const response = await fetch("/api/mascot/jobs/current", { cache: "no-store", signal });
  return readResponse(response, true);
}

export async function getSubjectHint(photo: File, selectedCategory: SubjectCategory, signal: AbortSignal) {
  const form = new FormData();
  form.set("photo", photo);
  form.set("selectedCategory", selectedCategory);
  const response = await fetch("/api/mascot/subject-hint", { method: "POST", body: form, signal });
  const body = await response.json().catch(() => ({})) as { hint?: SubjectHint; message?: string; code?: string };
  if (!response.ok || !body.hint) throw new GenerationRequestError(body.message ?? "Não foi possível conferir a foto.", response.status >= 500, body.code);
  return body.hint;
}

export async function createIncubation(
  photo: File,
  subjectIdentity: SubjectIdentity,
  poseChoices: PoseChoices,
  subjectHint: SubjectHint | undefined,
  idempotencyKey: string,
  signal: AbortSignal,
) {
  const form = new FormData();
  form.set("photo", photo);
  form.set("subjectCategory", subjectIdentity.category);
  form.set("subjectLabel", subjectIdentity.label);
  if (subjectIdentity.species) form.set("subjectSpecies", subjectIdentity.species);
  form.set("poseChoices", JSON.stringify(poseChoices));
  if (subjectHint) form.set("subjectHint", JSON.stringify(subjectHint));
  const response = await fetch("/api/mascot/incubations", {
    method: "POST",
    headers: { "X-Puleiro-Incubation-Key": idempotencyKey },
    body: form,
    signal,
  });
  return await readResponse(response) as GenerationJob;
}

export async function getIncubation(jobId: string, signal: AbortSignal) {
  const response = await fetch(`/api/mascot/incubations/${encodeURIComponent(jobId)}`, { cache: "no-store", signal });
  return await readResponse(response) as GenerationJob;
}

export async function hatchIncubation(jobId: string, signal: AbortSignal) {
  const response = await fetch(`/api/mascot/incubations/${encodeURIComponent(jobId)}/hatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal,
  });
  return await readResponse(response) as GenerationJob;
}

export async function selectIncubatorMaster(jobId: string, masterId: string, signal: AbortSignal) {
  const response = await fetch(`/api/mascot/incubations/${encodeURIComponent(jobId)}/masters/${encodeURIComponent(masterId)}/select`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal,
  });
  return await readResponse(response) as GenerationJob;
}

export async function deleteGenerationJob(jobId: string, signal: AbortSignal) {
  const response = await fetch(`/api/mascot/jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    signal,
  });
  const body = await response.json().catch(() => ({})) as { deleted?: boolean; message?: string; code?: string; supportCode?: string };
  if (!response.ok || body.deleted !== true) {
    throw new GenerationRequestError(
      safeSupportMessage(body.message ?? "Não foi possível excluir este nascimento agora.", body.supportCode),
      response.status >= 500,
      body.code ?? "JOB_DELETE_FAILED",
      body.supportCode,
    );
  }
}

export async function approveMaster(jobId: string, masterId: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/mascot/jobs/${encodeURIComponent(jobId)}/masters/${encodeURIComponent(masterId)}/approve`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal },
  );
  return await readResponse(response) as GenerationJob;
}

export async function updateMascotConfiguration(
  jobId: string,
  configuration: Partial<MascotConfiguration> & Pick<MascotConfiguration, "configurationRevision">,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/mascot/jobs/${encodeURIComponent(jobId)}/configuration`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configuration),
    signal,
  });
  return await readResponse(response) as GenerationJob;
}

const wait = (duration: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const onAbort = () => {
    window.clearTimeout(timer);
    reject(new DOMException("Polling cancelado", "AbortError"));
  };
  const timer = window.setTimeout(() => {
    signal.removeEventListener("abort", onAbort);
    resolve();
  }, duration);
  signal.addEventListener("abort", onAbort, { once: true });
});

const terminal = new Set<GenerationJob["status"]>([
  "registered",
  "awaiting_generation_authorization",
  "awaiting_master_approval",
  "master_approved",
  "awaiting_set_approval",
  "ready",
  "failed",
  "canceled",
]);

export async function pollGenerationJob(
  initial: GenerationJob,
  options: { intervalMs: number; timeoutMs: number; signal: AbortSignal; onProgress: (job: GenerationJob) => void },
) {
  if (terminal.has(initial.status)) return initial;
  const startedAt = Date.now();
  let networkAttempt = 0;
  while (Date.now() - startedAt < options.timeoutMs) {
    await wait(Math.min(options.intervalMs * 1.35 ** networkAttempt, 5_000), options.signal);
    try {
      const response = await fetch(`/api/mascot/jobs/${encodeURIComponent(initial.id)}`, { cache: "no-store", signal: options.signal });
      const job = await readResponse(response) as GenerationJob;
      options.onProgress(job);
      if (terminal.has(job.status)) return job;
      networkAttempt = 0;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof GenerationRequestError && !error.retryable) throw error;
      networkAttempt += 1;
    }
  }
  throw new GenerationRequestError("O nascimento continua em andamento. Você pode voltar depois sem enviar outra foto.", true, "GENERATION_STILL_RUNNING");
}
