export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MIN_IMAGE_DIMENSION = 256;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export type GenerationJobStatus =
  | "registered"
  | "awaiting_generation_authorization"
  | "queued"
  | "generating_masters"
  | "awaiting_master_approval"
  | "master_approved"
  | "generating_poses"
  | "awaiting_set_approval"
  | "packaging"
  | "ready"
  | "failed"
  | "canceled";

export interface MasterCandidate {
  id: string;
  imageUrl: string;
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

export interface GeneratedPose {
  id: string;
  role: PoseRole;
  optionId: string;
  label: string;
  imageUrl: string;
}

export interface MascotLibraryItem {
  id: string;
  mascotCode: string;
  jobId: string;
  attemptId: string;
  masterId: string;
  poses: GeneratedPose[];
  createdAt: string;
  isFavorite: boolean;
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
  poses: GeneratedPose[];
  errorCode?: string;
  retryable?: boolean;
  operationId?: string;
  requestId?: string;
  idempotentReplay?: boolean;
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

export interface MasterImage {
  bytes: Uint8Array;
  contentType: AcceptedImageType;
}

export interface MascotGenerationProvider {
  createMasterJob(input: CreateMasterJobInput): Promise<GenerationJob>;
  startMasterGeneration(jobId: string, identity: JobIdentity): Promise<GenerationJob>;
  getJob(jobId: string, identity: JobIdentity): Promise<GenerationJob | null>;
  getJobByAttempt(identity: JobIdentity): Promise<GenerationJob | null>;
  approveMaster(jobId: string, masterId: string, identity: JobIdentity): Promise<GenerationJob>;
  startPoseGeneration(jobId: string, choices: PoseChoices, identity: JobIdentity): Promise<GenerationJob>;
  getMasterImage?(jobId: string, masterId: string, identity: JobIdentity): Promise<MasterImage | null>;
  getPoseImage?(jobId: string, role: PoseRole, identity: JobIdentity): Promise<MasterImage | null>;
}
