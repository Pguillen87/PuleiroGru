import { describe, expect, it } from "vitest";
import { isPoseSetReadyForPackaging, poseSetFailureCode } from "@/lib/mascot-generation/pose-set-qc";
import type { GeneratedPose } from "@/lib/mascot-generation/types";

const hash = "a".repeat(64);
const qc = { status: "passed" as const, safe_reasons: [], alpha_ratio: 0.5, border_opaque_ratio: 0, foreground_components: 1, width: 1024, height: 1024 };
const poses: GeneratedPose[] = ["normal", "listening", "transcribing"].map((role) => ({
  id: `pose-${role}`, role: role as GeneratedPose["role"], optionId: role, label: role, imageUrl: "", sha256: hash, qc,
}));
const visualPass = { status: "passed" as const, code: "VISUAL_POSE_CONSISTENCY_PASSED", version: "pose-set-visual-v1", safe_reasons: [] };

describe("pose set packaging gate", () => {
  it("permite somente as três poses tecnicamente e visualmente aprovadas", () => {
    expect(isPoseSetReadyForPackaging(poses, visualPass)).toBe(true);
  });

  it("bloqueia alpha aprovado quando o enquadramento do conjunto falha", () => {
    const visualFail = { ...visualPass, status: "failed" as const, code: "VISUAL_POSE_CONSISTENCY_FAILED", safe_reasons: ["CANVAS_DIMENSIONS_MISMATCH"] };
    expect(isPoseSetReadyForPackaging(poses, visualFail)).toBe(false);
    expect(poseSetFailureCode(visualFail)).toBe("VISUAL_POSE_CONSISTENCY_FAILED");
  });

  it("bloqueia um close que corta o personagem mesmo no mesmo canvas", () => {
    const visualFail = { ...visualPass, status: "failed" as const, code: "VISUAL_POSE_CONSISTENCY_FAILED", safe_reasons: ["FRAME_CROP_RISK"] };
    expect(isPoseSetReadyForPackaging(poses, visualFail)).toBe(false);
  });

  it("bloqueia conjunto com pose ausente mesmo se o QC visual disser aprovado", () => {
    expect(isPoseSetReadyForPackaging(poses.slice(0, 2), visualPass)).toBe(false);
  });
});
