import type { GenerationJob } from "./types";

type JobResponse = { job?: GenerationJob; message?: string };

export class GenerationRequestError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
  }
}

async function readResponse(response: Response): Promise<JobResponse> {
  const body = await response.json().catch(() => ({})) as JobResponse;
  if (!response.ok || !body.job) {
    throw new GenerationRequestError(body.message ?? "O Puleiro não respondeu como esperado.", response.status >= 500);
  }
  return body;
}

export async function createGenerationJob(photo: File, signal: AbortSignal) {
  const formData = new FormData();
  formData.set("photo", photo);
  const response = await fetch("/api/mascot/jobs", {
    method: "POST",
    headers: { "X-Request-Id": crypto.randomUUID() },
    body: formData,
    signal,
  });
  return (await readResponse(response)).job as GenerationJob;
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

export async function pollGenerationJob(
  jobId: string,
  options: { intervalMs: number; timeoutMs: number; signal: AbortSignal; onProgress: (job: GenerationJob) => void },
) {
  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt < options.timeoutMs) {
    await wait(Math.min(options.intervalMs * 1.35 ** attempt, 5_000), options.signal);
    try {
      const response = await fetch(`/api/mascot/jobs/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
        signal: options.signal,
      });
      const job = (await readResponse(response)).job as GenerationJob;
      options.onProgress(job);
      if (job.status === "succeeded" || job.status === "failed") return job;
      attempt = 0;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof GenerationRequestError && !error.retryable) throw error;
      attempt += 1;
    }
  }
  throw new GenerationRequestError("O nascimento demorou mais que o esperado. Sua foto continua aqui.");
}
