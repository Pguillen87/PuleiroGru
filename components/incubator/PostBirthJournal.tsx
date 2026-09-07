"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { StageButton } from "@/components/actions/StageButton";
import {
  activatePostBirthProfile,
  getPostBirthProfile,
  PostBirthRequestError,
  type PostBirthProfile,
  updatePostBirthProfile,
} from "@/lib/mascot-generation/post-birth-client";

export function PostBirthJournal({ jobId }: { jobId: string }) {
  const [profile, setProfile] = useState<PostBirthProfile>();
  const [displayName, setDisplayName] = useState("");
  const [feedback, setFeedback] = useState("Abrindo o perfil pós-nascimento…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"saving" | "activating" | null>(null);
  const activationKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void getPostBirthProfile(jobId, controller.signal)
      .then((nextProfile) => {
        setProfile(nextProfile);
        setDisplayName(nextProfile.displayName ?? "");
        setFeedback(nextProfile.state === "ACTIVE" ? "Mascote ativo." : "Rascunho pós-nascimento carregado.");
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(profileErrorMessage(cause));
      });
    return () => controller.abort();
  }, [jobId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || profile.state === "ACTIVE" || !event.currentTarget.checkValidity()) return;
    setBusy("saving"); setError("");
    const controller = new AbortController();
    try {
      const nextProfile = await updatePostBirthProfile(jobId, {
        configurationRevision: profile.configurationRevision,
        display_name: displayName,
        journal_config: profile.journalConfig,
      }, controller.signal);
      setProfile(nextProfile);
      setDisplayName(nextProfile.displayName ?? displayName);
      setFeedback("Nome salvo.");
    } catch (cause) { setError(profileErrorMessage(cause)); }
    finally { setBusy(null); }
  }

  async function activate() {
    if (!profile || profile.state === "ACTIVE" || busy) return;
    setBusy("activating"); setError("");
    const controller = new AbortController();
    try {
      const nextProfile = await activatePostBirthProfile(jobId, profile.configurationRevision, getActivationKey(activationKey), controller.signal);
      setProfile(nextProfile);
      setFeedback("Mascote ativo.");
    } catch (cause) { setError(profileErrorMessage(cause)); }
    finally { setBusy(null); }
  }

  return <section className="post-birth-journal" aria-labelledby="post-birth-journal-title">
    <div className="post-birth-journal__heading">
      <span className="state-kicker">Depois do nascimento</span>
      <h2 id="post-birth-journal-title">Agora dê um nome ao seu mascote.</h2>
      <p>Guarde a identidade deste nascimento antes de ativá-lo.</p>
    </div>
    {profile ? <>
      {profile.state === "DRAFT" ? <form className="post-birth-journal__form" onSubmit={(event) => void save(event)}>
        <label htmlFor="post-birth-display-name">Nome do mascote</label>
        <input id="post-birth-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={32} required disabled={busy !== null} />
        <p className="post-birth-journal__hint">Use de 2 a 32 caracteres.</p>
        <div className="post-birth-journal__actions">
          <StageButton type="submit" disabled={busy !== null}>{busy === "saving" ? "Salvando…" : "Salvar nome"}</StageButton>
          <StageButton type="button" tone="secondary" disabled={busy !== null} onClick={() => void activate()}>{busy === "activating" ? "Ativando…" : "Ativar mascote"}</StageButton>
        </div>
      </form> : <div className="post-birth-journal__active">
        <label htmlFor="post-birth-display-name">Nome do mascote</label>
        <input id="post-birth-display-name" value={displayName} disabled readOnly />
        <p role="status">Mascote ativo. Esta identidade está confirmada.</p>
      </div>}
      <p className="post-birth-journal__readonly" role="note">As imagens aprovadas e o mascote mestre continuam somente para leitura.</p>
      {feedback && <p className="post-birth-journal__feedback" role="status" aria-live="polite">{feedback}</p>}
    </> : !error && <p className="post-birth-journal__feedback" role="status">{feedback}</p>}
    {error && <p className="stage-error" role="alert" aria-live="assertive">{error}</p>}
  </section>;
}

function getActivationKey(reference: { current: string | undefined }) {
  reference.current ??= `post-birth-profile-${crypto.randomUUID()}`;
  return reference.current;
}

function profileErrorMessage(cause: unknown) {
  if (cause instanceof PostBirthRequestError) {
    if (cause.status === 404) return "O perfil pós-nascimento ainda não está disponível. Tente novamente mais tarde.";
    if (cause.status === 409) return "Este perfil mudou em outra aba. Recarregue o Jornal para continuar.";
    if (cause.status === 401) return "Sua sessão terminou. Entre novamente para continuar.";
    if (cause.status === 400) return cause.message;
    if (cause.status >= 500) return "O perfil pós-nascimento está temporariamente indisponível. Tente novamente em instantes.";
  }
  return "Não foi possível carregar o perfil pós-nascimento. Tente novamente em instantes.";
}
