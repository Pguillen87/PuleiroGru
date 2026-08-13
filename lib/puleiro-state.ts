export type PuleiroState = "entry" | "preparing" | "revealing" | "revealed";

export const PREPARATION_DURATION_MS = 2_800;
export const REVEAL_DURATION_MS = 1_050;
export const REDUCED_REVEAL_DURATION_MS = 300;

export const stageNumber: Record<PuleiroState, string> = {
  entry: "01",
  preparing: "02",
  revealing: "03",
  revealed: "03",
};
