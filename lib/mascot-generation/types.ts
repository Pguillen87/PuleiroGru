export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const NORMALIZED_IMAGE_MIN_DIMENSION = 256;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export type GenerationJobStatus =
  | "registered"
  | "awaiting_generation_authorization"
  | "queued"
  | "generating_masters"
  | "validating_masters"
  | "awaiting_master_approval"
  | "validating_master"
  | "master_approved"
  | "generating_poses"
  | "validating_poses"
  | "awaiting_set_approval"
  | "packaging"
  | "ready"
  | "failed"
  | "canceled";

export interface MasterCandidate {
  id: string;
  imageUrl: string;
  qc?: AssetQualityMetrics;
}

export interface AssetQualityMetrics {
  status: "passed" | "failed";
  safe_reasons: string[];
  alpha_ratio: number;
  border_opaque_ratio: number;
  foreground_components: number;
  width: number;
  height: number;
}

export type SubjectCategory = "human" | "animal" | "object" | "other";

export interface SubjectIdentity {
  category: SubjectCategory;
  label: string;
  species?: string;
  confirmed: true;
}

export type PoseRole = "normal" | "listening" | "transcribing";
export type PoseChoices = Record<PoseRole, string>;

export type MascotWorkflowMode = "legacy_manual" | "async_incubator_v1";
export type IncubationProductState =
  | "PREPARING"
  | "INCUBATING"
  | "NEEDS_HUMAN_MASTER_SELECTION"
  | "READY_TO_HATCH"
  | "FAILED"
  | "HATCHED"
  | "PACKAGE_READY";

export interface SubjectHint {
  version: string;
  suggestedCategory: "human" | "animal" | "uncertain";
  confidenceBand: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  overrideConfirmed: boolean;
}

export interface MasterSelection {
  rankerVersion: string;
  selectedMasterId?: string;
  selectionSource?: "auto" | "human" | null;
  decision?: "AUTO_SELECTED" | "NEEDS_HUMAN_SELECTION" | "HUMAN_SELECTED" | "RANKING_FAILED";
  decisionReason?: string;
  masterRankerPolicyVersion?: string;
  top1Score?: number;
  top2Score?: number;
  margin?: number;
  scores: Array<{
    masterId: string;
    identity: number;
    category: number;
    composition: number;
    total: number;
  }>;
}

export interface GenerationCapabilities {
  contractVersion: "v2";
  master: { ready: boolean; modelVersion: string; promptVersion: string; reasons: string[] };
  poses: {
    ready: boolean;
    workerVersion: string;
    catalogVersion: string;
    templateVersion: string;
    reasons: string[];
  };
  poseCatalog: Record<PoseRole, string[]>;
  incubator?: {
    ready: boolean;
    enabled: boolean;
    workflowVersion: MascotWorkflowMode;
    rankerVersion: string;
    subjectHintVersion: string;
    encoder: { ready: boolean; reasonCode: string | null; version: string };
  };
}

export interface MascotConfiguration {
  displayName: string;
  poseChoices: PoseChoices;
  configurationRevision: number;
}

export interface GeneratedPose {
  id: string;
  role: PoseRole;
  optionId: string;
  label: string;
  imageUrl: string;
  sha256?: string;
  size?: number;
  templateVersion?: string;
  qc?: AssetQualityMetrics;
}

export interface MascotLibraryItem {
  id: string;
  displayName: string;
  mascotCode: string;
  jobId: string;
  attemptId: string;
  masterId: string;
  poses: GeneratedPose[];
  createdAt: string;
  isFavorite: boolean;
  favoriteRank?: number;
  isPublic?: boolean;
  finalization?: {
    state: "not_started" | "packaging" | "ready" | "failed";
    operationId?: string;
    errorCode?: string;
  };
}

/** Additive set-level gate; alpha QC on each asset is necessary but not sufficient. */
export interface PoseSetVisualQualityMetrics {
  status: "passed" | "failed";
  code: string;
  version: string;
  safe_reasons: string[];
}

export interface CommunityMascot {
  id: string;
  mascotCode: string;
  poses: GeneratedPose[];
  publishedAt: string;
  favoriteCount: number;
  saveCount: number;
  isFavorited: boolean;
  isSaved: boolean;
}

export type GenerationMetricStage = "master" | "poses";
export type GenerationMetricStatus = "requested" | "completed" | "failed" | "canceled";

export interface GenerationMetric {
  id: string;
  attemptId: string;
  jobId: string;
  stage: GenerationMetricStage;
  status: GenerationMetricStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  costSource?: "modal_reservation" | "modal_billing";
}

export interface GenerationJob {
  id: string;
  attemptId: string;
  status: GenerationJobStatus;
  message: string;
  generationScheduled: boolean;
  masters: MasterCandidate[];
  approvedMasterId?: string;
  subjectIdentity: SubjectIdentity;
  poseChoices: PoseChoices;
  configuration: MascotConfiguration;
  poses: GeneratedPose[];
  poseSetQc?: PoseSetVisualQualityMetrics;
  errorCode?: string;
  retryable?: boolean;
  operationId?: string;
  requestId?: string;
  idempotentReplay?: boolean;
  workflowMode?: MascotWorkflowMode;
  productState?: IncubationProductState;
  generationReadyAt?: string;
  hatchedAt?: string;
  masterSelection?: MasterSelection;
  subjectHint?: SubjectHint;
}

export interface IncubationSummary {
  jobId: string;
  attemptId: string;
  productState: IncubationProductState;
  phase: string;
  updatedAt: string;
  generationReadyAt?: string;
  hatchedAt?: string;
  errorCode?: string;
  selectedMasterId?: string;
  poseCount: number;
}

export interface JobIdentity {
  ownerId: string;
  attemptId: string;
  correlationId: string;
  operationId?: string;
  requestId?: string;
}

export interface CreateMasterJobInput extends JobIdentity {
  bytes: Uint8Array;
  contentType: AcceptedImageType;
  idempotencyKey: string;
  subjectIdentity: SubjectIdentity;
}

export interface CreateIncubationInput extends CreateMasterJobInput {
  poseChoices: PoseChoices;
  subjectHint?: SubjectHint;
}

export interface MasterImage {
  bytes: Uint8Array;
  contentType: AcceptedImageType;
}

export interface MascotGenerationProvider {
  getCapabilities(identity: JobIdentity): Promise<GenerationCapabilities>;
  createMasterJob(input: CreateMasterJobInput): Promise<GenerationJob>;
  createIncubation?(input: CreateIncubationInput): Promise<GenerationJob>;
  analyzeSubject?(input: Pick<CreateMasterJobInput, "bytes" | "contentType" | "ownerId" | "attemptId" | "correlationId"> & { selectedCategory: SubjectCategory }): Promise<SubjectHint>;
  startMasterGeneration(jobId: string, identity: JobIdentity): Promise<GenerationJob>;
  getJob(jobId: string, identity: JobIdentity): Promise<GenerationJob | null>;
  getJobByAttempt(identity: JobIdentity): Promise<GenerationJob | null>;
  deleteJob(jobId: string, identity: JobIdentity): Promise<{ deleted: true; idempotentReplay: boolean }>;
  approveMaster(jobId: string, masterId: string, identity: JobIdentity): Promise<GenerationJob>;
  selectIncubatorMaster(jobId: string, masterId: string, identity: JobIdentity): Promise<GenerationJob>;
  updateConfiguration(jobId: string, configuration: Partial<MascotConfiguration> & Pick<MascotConfiguration, "configurationRevision">, identity: JobIdentity): Promise<GenerationJob>;
  startPoseGeneration(jobId: string, choices: PoseChoices, identity: JobIdentity): Promise<GenerationJob>;
  getMasterImage?(jobId: string, masterId: string, identity: JobIdentity): Promise<MasterImage | null>;
  getPoseImage?(jobId: string, role: PoseRole, identity: JobIdentity): Promise<MasterImage | null>;
}
