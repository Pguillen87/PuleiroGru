import type { PoseChoices, SubjectHint } from "./types";
import { DEFAULT_POSE_CHOICES, POSE_OPTIONS } from "./pose-catalog";

export const SUPPORTED_SUBJECT_HINT_VERSIONS = ["subject-hint-v1", "subject-hint-policy-v2"] as const;

export class IncubationInputError extends Error {
  constructor(
    readonly code: "POSE_CHOICES_INVALID" | "SUBJECT_HINT_INVALID" | "INCUBATION_FORM_INVALID",
    message: string,
  ) {
    super(message);
  }
}

export function parseIncubationPoseChoices(value: FormDataEntryValue | null): PoseChoices {
  const parsed = parseJson(value, "POSE_CHOICES_INVALID") as Partial<PoseChoices>;
  const validIds = new Set(POSE_OPTIONS.map((option) => option.id));
  const choices = { ...DEFAULT_POSE_CHOICES, ...parsed };
  if (!validIds.has(choices.normal) || !validIds.has(choices.listening) || !validIds.has(choices.transcribing)) {
    throw new IncubationInputError("POSE_CHOICES_INVALID", "Escolha uma referência válida para cada pose.");
  }
  return choices;
}

export function parseIncubationSubjectHint(value: FormDataEntryValue | null): SubjectHint | undefined {
  if (!value) return undefined;
  const parsed = parseJson(value, "SUBJECT_HINT_INVALID");
  if (
    !isRecord(parsed)
    || !SUPPORTED_SUBJECT_HINT_VERSIONS.includes(parsed.version as typeof SUPPORTED_SUBJECT_HINT_VERSIONS[number])
    || typeof parsed.suggestedCategory !== "string"
    || !["human", "animal", "uncertain"].includes(parsed.suggestedCategory)
    || typeof parsed.confidenceBand !== "string"
    || !["low", "medium", "high"].includes(parsed.confidenceBand)
    || typeof parsed.requiresConfirmation !== "boolean"
    || typeof parsed.overrideConfirmed !== "boolean"
  ) {
    throw new IncubationInputError("SUBJECT_HINT_INVALID", "A confirmação da foto é inválida.");
  }
  return parsed as unknown as SubjectHint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: FormDataEntryValue | null, code: "POSE_CHOICES_INVALID" | "SUBJECT_HINT_INVALID") {
  try {
    return JSON.parse(String(value ?? "{}")) as unknown;
  } catch {
    throw new IncubationInputError(code, "Os dados enviados são inválidos.");
  }
}
