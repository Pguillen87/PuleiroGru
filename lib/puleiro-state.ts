export type PuleiroState =
  | "entry"
  | "photo-selection"
  | "photo-preview"
  | "subject-confirmation"
  | "uploading"
  | "creating-job"
  | "preparing"
  | "registered-safe"
  | "master-ready"
  | "master-approved"
  | "master-rejected"
  | "configuring-poses"
  | "choosing-normal"
  | "choosing-listening"
  | "choosing-transcribing"
  | "pose-selection-review"
  | "generating-poses"
  | "pose-set-ready"
  | "saving-library"
  | "code-ready"
  | "recoverable-error";

export const REVEAL_DURATION_MS = 1_050;
export const REDUCED_REVEAL_DURATION_MS = 300;

export const stageNumber: Record<PuleiroState, string> = {
  entry: "01",
  "photo-selection": "01",
  "photo-preview": "01",
  "subject-confirmation": "02",
  uploading: "03",
  "creating-job": "03",
  preparing: "03",
  "registered-safe": "03",
  "master-ready": "04",
  "master-approved": "04",
  "master-rejected": "04",
  "configuring-poses": "05",
  "choosing-normal": "05",
  "choosing-listening": "05",
  "choosing-transcribing": "05",
  "pose-selection-review": "05",
  "generating-poses": "05",
  "pose-set-ready": "05",
  "saving-library": "05",
  "code-ready": "05",
  "recoverable-error": "03",
};
