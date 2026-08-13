export type PuleiroState =
  | "entry"
  | "photo-selection"
  | "photo-preview"
  | "uploading"
  | "creating-job"
  | "preparing"
  | "master-ready"
  | "master-approved"
  | "master-rejected"
  | "recoverable-error";

export const REVEAL_DURATION_MS = 1_050;
export const REDUCED_REVEAL_DURATION_MS = 300;

export const stageNumber: Record<PuleiroState, string> = {
  entry: "01",
  "photo-selection": "01",
  "photo-preview": "01",
  uploading: "02",
  "creating-job": "02",
  preparing: "02",
  "master-ready": "03",
  "master-approved": "03",
  "master-rejected": "03",
  "recoverable-error": "02",
};
