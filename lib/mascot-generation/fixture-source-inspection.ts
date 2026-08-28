import type { PoseRole } from "./types";

export const fixtureSourceRoles: readonly PoseRole[] = ["normal", "listening", "transcribing"];

export const poseSetVisualV2Thresholds = {
  version: "pose-set-visual-v2",
  minFrameMargin: 0.02,
  maxHeightDelta: 0.12,
  maxWidthDelta: 0.12,
  maxOccupancyDelta: 0.18,
  maxForegroundDelta: 0.15,
  maxAspectRatioDelta: 0.2,
  maxCenterDelta: 0.08,
  maxVerticalCenterDelta: 0.08,
  maxFootBaseDelta: 0.04,
} as const;

type UnknownRecord = Record<string, unknown>;

function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function numbers(value: unknown): number[] | null {
  return Array.isArray(value) && value.length === 4 && value.every((entry) => number(entry) !== null) ? value as number[] : null;
}

export function inspectPoseQc(qc: UnknownRecord | undefined) {
  const width = number(qc?.width);
  const height = number(qc?.height);
  const box = numbers(qc?.bounding_box);
  const metrics = width && height && box ? {
    relativeWidth: (box[2] - box[0]) / width,
    relativeHeight: (box[3] - box[1]) / height,
    occupancy: ((box[2] - box[0]) / width) * ((box[3] - box[1]) / height),
    visibleAspectRatio: (box[2] - box[0]) / (box[3] - box[1]),
    centerX: ((box[0] + box[2]) / 2) / width,
    centerY: ((box[1] + box[3]) / 2) / height,
    footBase: box[3] / height,
    topMargin: box[1] / height,
    bottomMargin: (height - box[3]) / height,
  } : null;
  return {
    status: qc?.status === "passed" || qc?.status === "failed" ? qc.status : "unknown",
    safeReasons: Array.isArray(qc?.safe_reasons) ? qc.safe_reasons.filter((value): value is string => typeof value === "string") : [],
    width, height, boundingBox: box,
    alphaRatio: number(qc?.alpha_ratio), borderOpaqueRatio: number(qc?.border_opaque_ratio),
    foregroundComponents: number(qc?.foreground_components ?? qc?.component_count), foregroundRatio: number(qc?.foreground_ratio),
    haloRiskRatio: number(qc?.halo_risk_ratio), disconnectedNoisePixels: number(qc?.disconnected_noise_pixels),
    internalBackgroundComponents: number(qc?.internal_background_components), internalBackgroundArea: number(qc?.internal_background_area),
    largestInternalBackgroundComponent: number(qc?.largest_internal_background_component),
    metrics,
  };
}

export function shortHash(value: string | undefined) { return value && /^[a-f0-9]{64}$/.test(value) ? value.slice(0, 12) : null; }
