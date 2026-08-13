export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

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

export interface GenerationJob {
  id: string;
  attemptId: string;
  status: GenerationJobStatus;
  message: string;
  generationScheduled: boolean;
  masters: MasterCandidate[];
  approvedMasterId?: string;
  errorCode?: string;
  retryable?: boolean;
}

export interface JobIdentity {
  ownerId: string;
  attemptId: string;
  correlationId: string;
}

export interface CreateMasterJobInput extends JobIdentity {
  bytes: Uint8Array;
  contentType: AcceptedImageType;
  idempotencyKey: string;
}

export interface MasterImage {
  bytes: Uint8Array;
  contentType: AcceptedImageType;
}

export interface MascotGenerationProvider {
  createMasterJob(input: CreateMasterJobInput): Promise<GenerationJob>;
  getJob(jobId: string, identity: JobIdentity): Promise<GenerationJob | null>;
  getJobByAttempt(identity: JobIdentity): Promise<GenerationJob | null>;
  approveMaster(jobId: string, masterId: string, identity: JobIdentity): Promise<GenerationJob>;
  getMasterImage?(jobId: string, masterId: string, identity: JobIdentity): Promise<MasterImage | null>;
}
