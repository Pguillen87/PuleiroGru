import type { GeneratedPose, PoseRole, PoseSetVisualQualityMetrics } from "./types";

const expectedRoles: readonly PoseRole[] = ["normal", "listening", "transcribing"];

/** A package is eligible only when asset QC and set framing QC both pass. */
export function isPoseSetReadyForPackaging(
  poses: GeneratedPose[],
  poseSetQc?: PoseSetVisualQualityMetrics,
) {
  return poseSetQc?.status === "passed"
    && poses.length === expectedRoles.length
    && expectedRoles.every((role) => poses.filter((pose) =>
      pose.role === role && pose.qc?.status === "passed" && Boolean(pose.sha256),
    ).length === 1);
}

export function poseSetFailureCode(poseSetQc?: PoseSetVisualQualityMetrics) {
  return poseSetQc?.status === "failed" ? "VISUAL_POSE_CONSISTENCY_FAILED" : "POSE_SET_NOT_READY";
}
