import { describe, expect, it } from "vitest";
import { parseIncubationSubjectHint, IncubationInputError } from "@/lib/mascot-generation/incubation-input";

const validV2 = {
  version: "subject-hint-policy-v2",
  suggestedCategory: "uncertain",
  confidenceBand: "low",
  requiresConfirmation: false,
  overrideConfirmed: false,
};

describe("contrato de subject-hint da incubação", () => {
  it("aceita o contrato policy-v2 observado no Modal", () => {
    expect(parseIncubationSubjectHint(JSON.stringify(validV2))).toEqual(validV2);
  });

  it("mantém v1 somente para compatibilidade com o produtor mock/fallback", () => {
    expect(parseIncubationSubjectHint(JSON.stringify({ ...validV2, version: "subject-hint-v1" }))).toMatchObject({ version: "subject-hint-v1" });
  });

  it.each([
    { ...validV2, version: "future-policy" },
    null,
    { ...validV2, requiresConfirmation: "false" },
  ])("rejeita versão ou objeto malformado: %o", (value) => {
    expect(() => parseIncubationSubjectHint(JSON.stringify(value))).toThrowError(new IncubationInputError("SUBJECT_HINT_INVALID", "A confirmação da foto é inválida."));
  });

  it("preserva o bloqueio de mismatch sem confirmação", () => {
    const hint = parseIncubationSubjectHint(JSON.stringify({ ...validV2, suggestedCategory: "animal", confidenceBand: "high", requiresConfirmation: true, overrideConfirmed: false }));
    expect(hint?.requiresConfirmation).toBe(true);
    expect(hint?.overrideConfirmed).toBe(false);
  });
});
