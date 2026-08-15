import { describe, expect, it } from "vitest";
import { optionsForRole, POSE_OPTIONS, POSE_ROLE_ORDER } from "@/lib/mascot-generation/pose-catalog";

describe("catálogo de poses operacionais", () => {
  it("expõe quatro conceitos para cada uma das três funções", () => {
    expect(POSE_ROLE_ORDER).toEqual(["normal", "listening", "transcribing"]);
    for (const role of POSE_ROLE_ORDER) expect(optionsForRole(role, "other")).toHaveLength(4);
    expect(POSE_OPTIONS).toHaveLength(12);
  });

  it("não pressupõe orelhas ou mãos no gesto de escuta", () => {
    const copy = optionsForRole("listening", "object")
      .map(({ label, description }) => `${label} ${description}`.toLowerCase())
      .join(" ");
    expect(copy).not.toContain("mão na orelha");
  });
});
