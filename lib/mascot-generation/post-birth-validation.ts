export const POST_BIRTH_JOURNAL_CONFIG_VERSION = 1 as const;

export type PostBirthJournalConfig = {
  version: typeof POST_BIRTH_JOURNAL_CONFIG_VERSION;
};

export type PostBirthValidationCode = "INVALID_DISPLAY_NAME" | "INVALID_JOURNAL_CONFIG";

export class PostBirthValidationError extends Error {
  readonly code: PostBirthValidationCode;
  readonly status = 400 as const;

  constructor(code: PostBirthValidationCode, message: string) {
    super(message);
    this.name = "PostBirthValidationError";
    this.code = code;
  }
}

export function normalizePostBirthDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new PostBirthValidationError("INVALID_DISPLAY_NAME", "Informe um nome válido para o mascote.");
  }

  const normalized = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const characterCount = Array.from(normalized).length;

  if (characterCount < 2 || characterCount > 32) {
    throw new PostBirthValidationError(
      "INVALID_DISPLAY_NAME",
      "Informe um nome de 2 a 32 caracteres para o mascote.",
    );
  }

  return normalized;
}

export function validateJournalConfig(value: unknown): PostBirthJournalConfig {
  if (!isPlainObject(value) || value.version !== POST_BIRTH_JOURNAL_CONFIG_VERSION || Object.keys(value).length !== 1) {
    throw new PostBirthValidationError(
      "INVALID_JOURNAL_CONFIG",
      "A configuração do jornal não é compatível com esta versão.",
    );
  }

  return { version: POST_BIRTH_JOURNAL_CONFIG_VERSION };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
