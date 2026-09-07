export type PostBirthProfileState = "DRAFT" | "ACTIVE";

export type PostBirthJournalConfig = { version: 1 };

export type PostBirthProfile = {
  id: string;
  attemptId: string;
  modalJobId: string;
  state: PostBirthProfileState;
  displayName: string | null;
  journalConfig: PostBirthJournalConfig;
  configurationRevision: number;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
};

type PostBirthResponse = {
  profile?: PostBirthProfile;
  message?: string;
  code?: string;
  supportCode?: string;
  retryable?: boolean;
  idempotentReplay?: boolean;
};

export class PostBirthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "POST_BIRTH_REQUEST_FAILED",
    readonly retryable = status >= 500,
  ) {
    super(message);
    this.name = "PostBirthRequestError";
  }
}

export async function getPostBirthProfile(jobId: string, signal: AbortSignal) {
  const response = await fetch(profileUrl(jobId), { cache: "no-store", signal });
  return readProfileResponse(response);
}

export async function updatePostBirthProfile(
  jobId: string,
  input: { configurationRevision: number; display_name: string; journal_config: PostBirthJournalConfig },
  signal: AbortSignal,
) {
  const response = await fetch(profileUrl(jobId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  return readProfileResponse(response);
}

export async function activatePostBirthProfile(
  jobId: string,
  configurationRevision: number,
  idempotencyKey: string,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/mascot/incubations/${encodeURIComponent(jobId)}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ configurationRevision }),
    signal,
  });
  return readProfileResponse(response);
}

async function readProfileResponse(response: Response) {
  const body = await response.json().catch(() => ({})) as PostBirthResponse;
  if (!response.ok || !body.profile) {
    if (response.status === 401 && body.code === "SESSION_EXPIRED") {
      globalThis.window?.dispatchEvent(new Event("puleiro:auth-required"));
    }
    throw new PostBirthRequestError(
      body.message ?? "Não foi possível carregar o perfil pós-nascimento.",
      response.status,
      body.code,
      body.retryable ?? response.status >= 500,
    );
  }
  return body.profile;
}

function profileUrl(jobId: string) {
  return `/api/mascot/incubations/${encodeURIComponent(jobId)}/profile`;
}
