import "server-only";
import { createHash } from "node:crypto";
import { assertGenerationConfiguration, generationConfig } from "./config";
import { createModalAccessToken } from "./modal-auth";
import type {
  AcceptedImageType,
  CreateMasterJobInput,
  CreateIncubationInput,
  GenerationJob,
  GenerationCapabilities,
  AssetQualityMetrics,
  PoseSetVisualQualityMetrics,
  JobIdentity,
  MascotGenerationProvider,
  MasterImage,
  MascotConfiguration,
  PoseChoices,
  PoseRole,
  SubjectIdentity,
  SubjectHint,
} from "./types";
import { ACCEPTED_IMAGE_TYPES } from "./types";
import { POSE_CATALOG_VERSION } from "./pose-catalog";

type ModalJob = {
  jobId: string;
  attemptId: string;
  status: GenerationJob["status"];
  generationScheduled: boolean;
  masters?: Array<{ id: string; qc?: AssetQualityMetrics }>;
  approvedMasterId?: string;
  subjectIdentity?: SubjectIdentity;
  poseChoices?: PoseChoices;
  configuration?: MascotConfiguration;
  poses?: Array<{ id: string; role: PoseRole; optionId: string; label: string; sha256?: string; size?: number; templateVersion?: string; qc?: AssetQualityMetrics }>;
  poseSetQc?: PoseSetVisualQualityMetrics;
  error?: { code?: string; retryable?: boolean };
  operationId?: string;
  idempotentReplay?: boolean;
  workflowMode?: GenerationJob["workflowMode"];
  productState?: GenerationJob["productState"];
  generationReadyAt?: string;
  hatchedAt?: string;
  masterSelection?: GenerationJob["masterSelection"];
  subjectHint?: SubjectHint;
};

type ModalDeletion = {
  deleted: boolean;
  idempotent_replay?: boolean;
};

export class ModalProviderError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ModalProviderError";
  }
}

export class ModalMascotGenerationProvider implements MascotGenerationProvider {
  private readonly baseUrl: string;

  constructor() {
    assertGenerationConfiguration();
    this.baseUrl = generationConfig.modalApiUrl;
  }

  async getCapabilities(identity: JobIdentity): Promise<GenerationCapabilities> {
    const response = await this.request("/v2/mascot/capabilities", identity);
    if (!response.ok) await this.throwResponse(response);
    return response.json() as Promise<GenerationCapabilities>;
  }

  async createMasterJob(input: CreateMasterJobInput) {
    const response = await this.request("/v2/mascot/jobs", input, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.idempotencyKey,
        "X-Correlation-Id": input.correlationId,
        ...(input.operationId ? { "X-Operation-Id": input.operationId } : {}),
        ...(input.requestId ? { "X-Bff-Request-Id": input.requestId } : {}),
      },
      body: JSON.stringify({
        image_base64: Buffer.from(input.bytes).toString("base64"),
        content_type: input.contentType,
        attempt_id: input.attemptId,
        subject_identity: input.subjectIdentity,
      }),
    });
    return this.toGenerationJob(await this.readJob(response), response);
  }

  async analyzeSubject(
    input: Pick<CreateMasterJobInput, "bytes" | "contentType" | "ownerId" | "attemptId" | "correlationId"> & { selectedCategory: SubjectIdentity["category"] },
  ) {
    const response = await this.request("/v2/mascot/subject-hint", input, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: Buffer.from(input.bytes).toString("base64"),
        content_type: input.contentType,
        selected_category: input.selectedCategory,
      }),
    });
    if (!response.ok) await this.throwResponse(response);
    return response.json() as Promise<SubjectHint>;
  }

  async createIncubation(input: CreateIncubationInput) {
    const response = await this.request("/v2/mascot/incubations", input, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.idempotencyKey,
        ...this.operationHeaders(input),
      },
      body: JSON.stringify({
        image_base64: Buffer.from(input.bytes).toString("base64"),
        content_type: input.contentType,
        attempt_id: input.attemptId,
        subject_identity: input.subjectIdentity,
        pose_choices: input.poseChoices,
        subject_hint: input.subjectHint,
      }),
    });
    return this.toGenerationJob(await this.readJob(response), response);
  }

  async startMasterGeneration(jobId: string, identity: JobIdentity) {
    const response = await this.request(
      `/v2/mascot/jobs/${encodeURIComponent(jobId)}/master-generations`,
      identity,
      {
        method: "POST",
        headers: {
          ...this.operationHeaders(identity),
          "X-Idempotency-Key": `master:${identity.ownerId}:${identity.attemptId}:${jobId}`,
        },
      },
    );
    return this.toGenerationJob(await this.readJob(response), response);
  }

  async getJob(jobId: string, identity: JobIdentity) {
    const response = await this.request(`/v2/mascot/jobs/${encodeURIComponent(jobId)}`, identity);
    if (response.status === 404) return null;
    return this.toGenerationJob(await this.readJob(response), response);
  }

  async getJobByAttempt(identity: JobIdentity) {
    const query = encodeURIComponent(identity.attemptId);
    const response = await this.request(`/v2/mascot/jobs?attempt_id=${query}`, identity);
    if (response.status === 404) return null;
    return this.toGenerationJob(await this.readJob(response), response);
  }

  async deleteJob(jobId: string, identity: JobIdentity) {
    const response = await this.request(`/v2/mascot/jobs/${encodeURIComponent(jobId)}`, identity, {
      method: "DELETE",
      headers: {
        ...this.operationHeaders(identity),
        "X-Idempotency-Key": `delete:${identity.ownerId}:${identity.attemptId}:${jobId}`,
      },
    });
    const payload = await this.readDeletion(response);
    if (!payload.deleted) throw new ModalProviderError(503, "JOB_DELETE_FAILED", "A exclusão do nascimento não foi confirmada.");
    return { deleted: true as const, idempotentReplay: payload.idempotent_replay === true };
  }

  async approveMaster(jobId: string, masterId: string, identity: JobIdentity) {
    const path = `/v2/mascot/jobs/${encodeURIComponent(jobId)}/masters/${encodeURIComponent(masterId)}/approve`;
    const response = await this.request(path, identity, {
      method: "POST",
      headers: {
        ...this.operationHeaders(identity),
        "X-Idempotency-Key": `approve:${identity.ownerId}:${identity.attemptId}:${jobId}:${masterId}`,
      },
    });
    return this.toGenerationJob(await this.readJob(response), response);
  }

  async selectIncubatorMaster(jobId: string, masterId: string, identity: JobIdentity) {
    const response = await this.request(`/v2/mascot/incubations/${encodeURIComponent(jobId)}/masters/${encodeURIComponent(masterId)}/select`, identity, {
      method: "POST",
      headers: { ...this.operationHeaders(identity), "X-Idempotency-Key": `incubator-select:${identity.ownerId}:${identity.attemptId}:${jobId}:${masterId}` },
    });
    return this.toGenerationJob(await this.readJob(response), response);
  }

  async updateConfiguration(
    jobId: string,
    configuration: Partial<MascotConfiguration> & Pick<MascotConfiguration, "configurationRevision">,
    identity: JobIdentity,
  ) {
    const response = await this.request(`/v2/mascot/jobs/${encodeURIComponent(jobId)}/configuration`, identity, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...this.operationHeaders(identity),
        "X-Idempotency-Key": `configuration:${identity.ownerId}:${identity.attemptId}:${jobId}:${configuration.configurationRevision}`,
      },
      body: JSON.stringify({
        display_name: configuration.displayName,
        pose_choices: configuration.poseChoices,
        configuration_revision: configuration.configurationRevision,
      }),
    });
    return this.toGenerationJob(await this.readJob(response), response);
  }

  async startPoseGeneration(jobId: string, choices: PoseChoices, identity: JobIdentity) {
    const path = `/v2/mascot/jobs/${encodeURIComponent(jobId)}/pose-generations`;
    const response = await this.request(path, identity, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.operationHeaders(identity),
        "X-Idempotency-Key": poseIdempotencyKey(identity, jobId, choices),
      },
      body: JSON.stringify({ pose_choices: choices, catalog_version: POSE_CATALOG_VERSION }),
    });
    return this.toGenerationJob(await this.readJob(response), response);
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

  async getPoseImage(jobId: string, role: PoseRole, identity: JobIdentity): Promise<MasterImage | null> {
    const path = `/v2/mascot/jobs/${encodeURIComponent(jobId)}/poses/${encodeURIComponent(role)}`;
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
      headers: {
        ...this.operationHeaders(identity),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(modalRequestTimeoutMs(path, init.method)),
    });
    return response;
  }

  private operationHeaders(identity: JobIdentity) {
    return {
      "X-Correlation-Id": identity.correlationId,
      ...(identity.operationId ? { "X-Operation-Id": identity.operationId } : {}),
      ...(identity.requestId ? { "X-Bff-Request-Id": identity.requestId } : {}),
    };
  }

  private async readJob(response: Response) {
    if (!response.ok) await this.throwResponse(response);
    return response.json() as Promise<ModalJob>;
  }

  private async readDeletion(response: Response) {
    if (!response.ok) await this.throwResponse(response);
    return response.json() as Promise<ModalDeletion>;
  }

  private async throwResponse(response: Response): Promise<never> {
    const body = await response.json().catch(() => ({})) as {
      code?: string;
      detail?: string | { code?: string; message?: string };
      message?: string;
    };
    const detail = typeof body.detail === "object" ? body.detail : undefined;
    throw new ModalProviderError(
      response.status,
      body.code ?? detail?.code ?? "MODAL_REQUEST_FAILED",
      body.message ?? detail?.message ?? (typeof body.detail === "string" ? body.detail : undefined) ?? "O serviço de mascotes não respondeu como esperado.",
    );
  }

  private toGenerationJob(job: ModalJob, response?: Response): GenerationJob {
    const masterRecords = job.masters ?? (job.approvedMasterId ? [{ id: job.approvedMasterId }] : []);
    return {
      id: job.jobId,
      attemptId: job.attemptId,
      status: job.status,
      message: statusMessage(job.status),
      generationScheduled: job.generationScheduled,
      masters: masterRecords.map(({ id, qc }) => ({
        id, qc,
        imageUrl: `/api/mascot/jobs/${encodeURIComponent(job.jobId)}/master/${encodeURIComponent(id)}`,
      })),
      approvedMasterId: job.approvedMasterId,
      subjectIdentity: job.subjectIdentity ?? { category: "other", label: "sujeito confirmado", confirmed: true },
      poseChoices: job.poseChoices ?? {
        normal: "normal_attentive",
        listening: "listening_focus",
        transcribing: "transcribing_fast",
      },
      configuration: job.configuration ?? {
        displayName: "Mascote GRU",
        poseChoices: job.poseChoices ?? {
          normal: "normal_attentive",
          listening: "listening_focus",
          transcribing: "transcribing_fast",
        },
        configurationRevision: 0,
      },
      poses: (job.poses ?? []).map((pose) => ({
        ...pose,
        imageUrl: `/api/mascot/jobs/${encodeURIComponent(job.jobId)}/pose/${encodeURIComponent(pose.role)}`,
      })),
      poseSetQc: job.poseSetQc,
      errorCode: job.error?.code,
      retryable: job.error?.retryable,
      operationId: job.operationId ?? response?.headers.get("x-operation-id") ?? undefined,
      requestId: response?.headers.get("x-request-id") ?? undefined,
      idempotentReplay: job.idempotentReplay,
      workflowMode: job.workflowMode,
      productState: job.productState,
      generationReadyAt: job.generationReadyAt,
      hatchedAt: job.hatchedAt,
      masterSelection: job.masterSelection,
      subjectHint: job.subjectHint,
    };
  }
}

export function modalRequestTimeoutMs(path: string, method = "GET") {
  if (method === "POST" && path === "/v2/mascot/jobs") return 35_000;
  if (method === "DELETE" && /^\/v2\/mascot\/jobs\/[^/?]+$/.test(path)) return 60_000;
  if (method === "POST") return 20_000;
  return 20_000;
}

function poseIdempotencyKey(identity: JobIdentity, jobId: string, choices: PoseChoices) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ jobId, choices }))
    .digest("hex")
    .slice(0, 24);
  return `poses:${identity.ownerId}:${identity.attemptId}:${jobId}:${fingerprint}`;
}

function statusMessage(status: GenerationJob["status"]) {
  const messages: Record<GenerationJob["status"], string> = {
    registered: "Seu pedido de nascimento ficou guardado com segurança.",
    awaiting_generation_authorization: "Aguardando autorização para iniciar o nascimento.",
    queued: "Conferindo sua foto…",
    generating_masters: "Criando três opções de mascote…",
    validating_masters: "Conferindo fundo, recorte e qualidade das três opções…",
    awaiting_master_approval: "Escolha o mascote mestre que mais combina com você.",
    validating_master: "Validando o mascote mestre escolhido…",
    master_approved: "Mascote mestre aprovado. Nenhuma pose foi iniciada.",
    generating_poses: "Preparando os jeitos do seu mascote…",
    validating_poses: "Conferindo transparência e consistência das três poses…",
    awaiting_set_approval: "As poses estão prontas para revisão.",
    packaging: "Empacotando o mascote…",
    ready: "Seu mascote está pronto.",
    failed: "Não conseguimos concluir este nascimento.",
    canceled: "Este nascimento foi cancelado.",
  };
  return messages[status];
}
