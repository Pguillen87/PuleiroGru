import "server-only";
import { generationConfig } from "./config";
import { createModalAccessToken } from "./modal-auth";
import type {
  AcceptedImageType,
  CreateMasterJobInput,
  GenerationJob,
  JobIdentity,
  MascotGenerationProvider,
  MasterImage,
} from "./types";
import { ACCEPTED_IMAGE_TYPES } from "./types";

type ModalJob = {
  jobId: string;
  attemptId: string;
  status: GenerationJob["status"];
  generationScheduled: boolean;
  masters?: Array<{ id: string }>;
  approvedMasterId?: string;
  error?: { code?: string; retryable?: boolean };
};

export class ModalProviderError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export class ModalMascotGenerationProvider implements MascotGenerationProvider {
  private readonly baseUrl: string;

  constructor() {
    if (!generationConfig.modalApiUrl || !generationConfig.modalBffJwtSecret) {
      throw new Error("Configuração Modal v2 incompleta no servidor.");
    }
    this.baseUrl = generationConfig.modalApiUrl;
  }

  async createMasterJob(input: CreateMasterJobInput) {
    const response = await this.request("/v2/mascot/jobs", input, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.idempotencyKey,
        "X-Correlation-Id": input.correlationId,
      },
      body: JSON.stringify({
        image_base64: Buffer.from(input.bytes).toString("base64"),
        content_type: input.contentType,
        attempt_id: input.attemptId,
      }),
    });
    return this.toGenerationJob(await this.readJob(response));
  }

  async startMasterGeneration(jobId: string, identity: JobIdentity) {
    const response = await this.request(
      `/v2/mascot/jobs/${encodeURIComponent(jobId)}/master-generations`,
      identity,
      {
        method: "POST",
        headers: {
          "X-Correlation-Id": identity.correlationId,
          "X-Idempotency-Key": `master:${identity.ownerId}:${identity.attemptId}:${jobId}`,
        },
      },
    );
    return this.toGenerationJob(await this.readJob(response));
  }

  async getJob(jobId: string, identity: JobIdentity) {
    const response = await this.request(`/v2/mascot/jobs/${encodeURIComponent(jobId)}`, identity);
    if (response.status === 404) return null;
    return this.toGenerationJob(await this.readJob(response));
  }

  async getJobByAttempt(identity: JobIdentity) {
    const query = encodeURIComponent(identity.attemptId);
    const response = await this.request(`/v2/mascot/jobs?attempt_id=${query}`, identity);
    if (response.status === 404) return null;
    return this.toGenerationJob(await this.readJob(response));
  }

  async approveMaster(jobId: string, masterId: string, identity: JobIdentity) {
    const path = `/v2/mascot/jobs/${encodeURIComponent(jobId)}/masters/${encodeURIComponent(masterId)}/approve`;
    const response = await this.request(path, identity, {
      method: "POST",
      headers: { "X-Correlation-Id": identity.correlationId },
    });
    return this.toGenerationJob(await this.readJob(response));
  }

  async getMasterImage(jobId: string, masterId: string, identity: JobIdentity): Promise<MasterImage | null> {
    const path = `/v2/mascot/jobs/${encodeURIComponent(jobId)}/masters/${encodeURIComponent(masterId)}`;
    const response = await this.request(path, identity);
    if (response.status === 404) return null;
    if (!response.ok) await this.throwResponse(response);
    const contentType = response.headers.get("content-type")?.split(";")[0] as AcceptedImageType;
    if (!ACCEPTED_IMAGE_TYPES.includes(contentType)) throw new Error("Modal retornou tipo de imagem não suportado.");
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
  }

  private async request(path: string, identity: JobIdentity, init: RequestInit = {}) {
    const token = await createModalAccessToken(identity.ownerId, identity.attemptId);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(init.method === "POST" ? 15_000 : 8_000),
    });
    return response;
  }

  private async readJob(response: Response) {
    if (!response.ok) await this.throwResponse(response);
    return response.json() as Promise<ModalJob>;
  }

  private async throwResponse(response: Response): Promise<never> {
    const body = await response.json().catch(() => ({})) as { code?: string; detail?: string; message?: string };
    throw new ModalProviderError(
      response.status,
      body.code ?? "MODAL_REQUEST_FAILED",
      body.message ?? body.detail ?? "O serviço de mascotes não respondeu como esperado.",
    );
  }

  private toGenerationJob(job: ModalJob): GenerationJob {
    return {
      id: job.jobId,
      attemptId: job.attemptId,
      status: job.status,
      message: statusMessage(job.status),
      generationScheduled: job.generationScheduled,
      masters: (job.masters ?? []).map(({ id }) => ({
        id,
        imageUrl: `/api/mascot/jobs/${encodeURIComponent(job.jobId)}/master/${encodeURIComponent(id)}`,
      })),
      approvedMasterId: job.approvedMasterId,
      errorCode: job.error?.code,
      retryable: job.error?.retryable,
    };
  }
}

function statusMessage(status: GenerationJob["status"]) {
  const messages: Record<GenerationJob["status"], string> = {
    registered: "Seu pedido de nascimento ficou guardado com segurança.",
    awaiting_generation_authorization: "Aguardando autorização para iniciar o nascimento.",
    queued: "Conferindo sua foto…",
    generating_masters: "Criando três opções de mascote…",
    awaiting_master_approval: "Escolha o mascote mestre que mais combina com você.",
    master_approved: "Mascote mestre aprovado. Nenhuma pose foi iniciada.",
    generating_poses: "Preparando os jeitos do seu mascote…",
    awaiting_set_approval: "As poses estão prontas para revisão.",
    packaging: "Empacotando o mascote…",
    ready: "Seu mascote está pronto.",
    failed: "Não conseguimos concluir este nascimento.",
    canceled: "Este nascimento foi cancelado.",
  };
  return messages[status];
}
