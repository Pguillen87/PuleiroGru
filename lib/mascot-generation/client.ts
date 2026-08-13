import type { GenerationJob } from "./types";

type JobResponse = { job?: GenerationJob | null; message?: string };

export class GenerationRequestError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
  }
}

export async function establishBrowserSession(idToken: string, appCheckToken: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "X-Firebase-AppCheck": appCheckToken },
  });
  if (!response.ok) await readResponse(response, true);
}

async function readResponse(response: Response, allowEmpty = false) {
  const body = await response.json().catch(() => ({})) as JobResponse;
  if (!response.ok || (!allowEmpty && !body.job)) {
    throw new GenerationRequestError(body.message ?? "O Puleiro não respondeu como esperado.", response.status >= 500);
  }
  return body.job ?? null;
}

export async function createGenerationJob(photo: File, signal: AbortSignal) {
  const formData = new FormData();
  formData.set("photo", photo);
  const response = await fetch("/api/mascot/jobs", { method: "POST", body: formData, signal });
  return await readResponse(response) as GenerationJob;
}

export async function resumeGenerationJob(signal: AbortSignal) {
  const response = await fetch("/api/mascot/jobs/current", { cache: "no-store", signal });
  return readResponse(response, true);
}

export async function approveMaster(jobId: string, masterId: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/mascot/jobs/${encodeURIComponent(jobId)}/masters/${encodeURIComponent(masterId)}/approve`,
    { method: "POST", signal },
  );
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
  throw new GenerationRequestError("O nascimento continua em andamento. Você pode voltar depois sem pagar novamente.");
}
