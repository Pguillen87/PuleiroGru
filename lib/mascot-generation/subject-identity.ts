import type { SubjectCategory, SubjectIdentity } from "./types";

const CATEGORIES = new Set<SubjectCategory>(["human", "animal", "object", "other"]);
const SAFE_DESCRIPTION = /^[\p{L}\p{N} .,'()/_-]+$/u;

export class SubjectIdentityError extends Error {
  readonly code = "SUBJECT_IDENTITY_INVALID";
}

export function parseSubjectIdentity(formData: FormData): SubjectIdentity {
  const category = String(formData.get("subjectCategory") ?? "") as SubjectCategory;
  const label = normalize(String(formData.get("subjectLabel") ?? ""), 64);
  const species = normalize(String(formData.get("subjectSpecies") ?? ""), 64);
  if (!CATEGORIES.has(category) || !label) {
    throw new SubjectIdentityError("Confirme o que aparece na foto antes de continuar.");
  }
  if (!SAFE_DESCRIPTION.test(label) || (species && !SAFE_DESCRIPTION.test(species))) {
    throw new SubjectIdentityError("Use apenas uma descrição curta do sujeito, sem instruções ou símbolos especiais.");
  }
  if (category === "animal" && !species) {
    throw new SubjectIdentityError("Informe a espécie do animal antes de continuar.");
  }
  return {
    category,
    label,
    species: category === "animal" ? species : undefined,
    confirmed: true,
  };
}

function normalize(value: string, maximum: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}
