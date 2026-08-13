export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export type GenerationJobStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "succeeded"
  | "failed";

export interface GenerationJob {
  id: string;
  status: GenerationJobStatus;
  message: string;
  masterImageUrl?: string;
  errorCode?: string;
  retryable?: boolean;
}

export interface CreateMasterJobInput {
  bytes: Uint8Array;
  contentType: AcceptedImageType;
  requestId: string;
}

export interface MasterImage {
  bytes: Uint8Array;
  contentType: AcceptedImageType;
}

export interface MascotGenerationProvider {
  createMasterJob(input: CreateMasterJobInput): Promise<GenerationJob>;
  getJob(jobId: string): Promise<GenerationJob | null>;
  getMasterImage?(jobId: string, masterId: string): Promise<MasterImage | null>;
}
