import "server-only";
import { generationConfig } from "./config";
import type {
  AcceptedImageType,
  CreateMasterJobInput,
  GenerationJob,
  MascotGenerationProvider,
  MasterImage,
} from "./types";
import { ACCEPTED_IMAGE_TYPES } from "./types";

type ModalJob = {
  job_id: string;
  state: string;
  error?: { code?: string; message?: string; retryable?: boolean };
  masters?: Array<{ id: string }>;
};

const finishedStates = new Set(["AWAITING_MASTER_APPROVAL", "MASTER_APPROVED"]);
const failedStates = new Set(["FAILED", "CANCELED"]);

export class ModalMascotGenerationProvider implements MascotGenerationProvider {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor() {
    const { modalApiUrl, modalApiToken, modalAppCheckToken } = generationConfig;
    if (!modalApiUrl || !modalApiToken || !modalAppCheckToken) {
      throw new Error("Configuração Modal incompleta no servidor.");
    }
    this.baseUrl = modalApiUrl;
    this.headers = {
      Authorization: `Bearer ${modalApiToken}`,
      "X-Firebase-AppCheck": modalAppCheckToken,
    };
  }

  async createMasterJob(input: CreateMasterJobInput): Promise<GenerationJob> {
    const response = await fetch(`${this.baseUrl}/v1/mascot/jobs`, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.requestId,
      },
      body: JSON.stringify({
        image_base64: Buffer.from(input.bytes).toString("base64"),
        content_type: input.contentType,
      }),
      cache: "no-store",
    });
    return this.toGenerationJob(await this.readJob(response));
  }

  async getJob(jobId: string): Promise<GenerationJob | null> {
    const response = await fetch(`${this.baseUrl}/v1/mascot/jobs/${encodeURIComponent(jobId)}`, {
      headers: this.headers,
      cache: "no-store",
    });
    if (response.status === 404) return null;
    return this.toGenerationJob(await this.readJob(response));
  }

  async getMasterImage(jobId: string, masterId: string): Promise<MasterImage | null> {
    const response = await fetch(
      `${this.baseUrl}/v1/mascot/jobs/${encodeURIComponent(jobId)}/masters/${encodeURIComponent(masterId)}`,
      { headers: this.headers, cache: "no-store" },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Modal master proxy failed: ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0] as AcceptedImageType;
    if (!ACCEPTED_IMAGE_TYPES.includes(contentType)) throw new Error("Modal returned an unsupported image type.");
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
  }

  private async readJob(response: Response): Promise<ModalJob> {
    if (!response.ok) throw new Error(`Modal request failed: ${response.status}`);
    return response.json() as Promise<ModalJob>;
  }

  private toGenerationJob(job: ModalJob): GenerationJob {
    const masterId = job.masters?.[0]?.id;
    if (finishedStates.has(job.state) && masterId) {
      return {
        id: job.job_id,
        status: "succeeded",
        message: "Seu mascote está pronto.",
        masterImageUrl: `/api/mascot/jobs/${encodeURIComponent(job.job_id)}/master/${encodeURIComponent(masterId)}`,
      };
    }
    if (failedStates.has(job.state)) {
      return {
        id: job.job_id,
        status: "failed",
        message: job.error?.message ?? "Não conseguimos concluir este nascimento.",
        errorCode: job.error?.code ?? job.state,
        retryable: job.error?.retryable ?? true,
      };
    }
    return { id: job.job_id, status: "processing", message: this.statusMessage(job.state) };
  }

  private statusMessage(state: string) {
    if (state === "QUEUED" || state === "VALIDATING_INPUT") return "Conferindo sua foto…";
    if (state === "READY_FOR_GENERATION") return "Preparando o nascimento…";
    if (state === "GENERATING_MASTER") return "Criando o mascote mestre…";
    return "Finalizando os detalhes…";
  }
}
