"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StageButton } from "@/components/actions/StageButton";
import {
  activatePostBirthProfile,
  getPostBirthProfile,
  updatePostBirthProfile,
  PostBirthRequestError,
  type PostBirthProfile,
} from "@/lib/mascot-generation/post-birth-client";

export function PostBirthJournal({ jobId }: { jobId: string }) {
  const [profile, setProfile] = useState<PostBirthProfile>();
  const [displayName, setDisplayName] = useState("");
  const [feedback, setFeedback] = useState("Abrindo o perfil pós-nascimento…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"activating" | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const activationKey = useRef<string | undefined>(undefined);
  const draftRequest = useRef<AbortController | null>(null);
  const draftTimer = useRef<number | null>(null);
  const draftSavePromise = useRef<Promise<PostBirthProfile | null> | null>(null);

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

  const saveDraft = useCallback(async (nextDisplayName: string, revision: number): Promise<PostBirthProfile | null> => {
    if (draftRequest.current) return null;
    const controller = new AbortController();
    draftRequest.current = controller;
    setSaveState("saving"); setError("");
    try {
      const nextProfile = await updatePostBirthProfile(jobId, {
        configurationRevision: revision,
        display_name: nextDisplayName,
        journal_config: { version: 1 },
      }, controller.signal);
      setProfile(nextProfile);
      setSaveState("saved");
      setFeedback("Rascunho salvo. Você ainda pode revisar o nome antes de guardar.");
      return nextProfile;
    } catch (cause) {
      if (!controller.signal.aborted) {
        setSaveState(cause instanceof PostBirthRequestError && cause.status === 409 ? "conflict" : "idle");
        setError(profileErrorMessage(cause));
      }
      return null;
    } finally {
      if (draftRequest.current === controller) draftRequest.current = null;
    }
  }, [jobId]);

  useEffect(() => {
    if (!profile || profile.state !== "DRAFT" || busy || displayName.trim().length < 2 || displayName === profile.displayName) return;
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = null;
      const pending = saveDraft(displayName, profile.configurationRevision);
      draftSavePromise.current = pending;
      void pending.finally(() => {
        if (draftSavePromise.current === pending) draftSavePromise.current = null;
      });
    }, 750);
    return () => {
      if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
      draftTimer.current = null;
    };
  }, [busy, displayName, profile, saveDraft]);

  useEffect(() => () => draftRequest.current?.abort(), []);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || profile.state === "ACTIVE" || !event.currentTarget.checkValidity()) return;
    if (draftTimer.current !== null) {
      window.clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    setBusy("activating"); setError("");
    const controller = new AbortController();
    try {
      const savedDraft = draftSavePromise.current ? await draftSavePromise.current : null;
      if (draftSavePromise.current && !savedDraft) {
        setBusy(null);
        return;
      }
      const nextProfile = await activatePostBirthProfile(jobId, {
        configurationRevision: savedDraft?.configurationRevision ?? profile.configurationRevision,
        displayName,
      }, getActivationKey(activationKey), controller.signal);
      setProfile(nextProfile);
      setDisplayName(nextProfile.displayName ?? displayName);
      setSaveState("saved");
      setFeedback("Mascote ativo e guardado em Meus Mascotes.");
    } catch (cause) { setError(profileErrorMessage(cause)); }
    finally { setBusy(null); }
  }

  async function reconcileDraft() {
    if (!profile || profile.state !== "DRAFT" || displayName.trim().length < 2) return;
    setSaveState("saving"); setError("");
    try {
      const latest = await getPostBirthProfile(jobId, new AbortController().signal);
      setProfile(latest);
      await saveDraft(displayName, latest.configurationRevision);
    } catch (cause) {
      setSaveState("conflict"); setError(profileErrorMessage(cause));
    }
  }

  return <section className="post-birth-journal" aria-labelledby="post-birth-journal-title">
    <div className="post-birth-journal__heading">
      <span className="state-kicker">Depois do nascimento</span>
      <h2 id="post-birth-journal-title">Agora dê um nome ao seu mascote.</h2>
      <p>Guarde a identidade deste nascimento antes de ativá-lo.</p>
    </div>
    {profile ? <>
      {profile.state === "DRAFT" ? <form className="post-birth-journal__form" onSubmit={(event) => void confirm(event)}>
        <label htmlFor="post-birth-display-name">Nome do mascote</label>
        <input id="post-birth-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={32} required disabled={busy !== null} />
        <p className="post-birth-journal__hint">Use de 2 a 32 caracteres.</p>
        {saveState === "saving" && <p className="post-birth-journal__feedback" role="status">Salvando o rascunho…</p>}
        {saveState === "saved" && <p className="post-birth-journal__feedback" role="status">Rascunho salvo.</p>}
        {saveState === "conflict" && <div className="post-birth-journal__conflict" role="group" aria-label="Reconciliação do rascunho"><p>Outra aba atualizou este perfil. Seu nome continua preservado aqui.</p><button type="button" onClick={() => void reconcileDraft()} disabled={busy !== null}>Reconciliar e salvar este nome</button></div>}
        <div className="post-birth-journal__actions">
          <StageButton type="submit" disabled={busy !== null}>{busy === "activating" ? "Guardando…" : "Confirmar nome e guardar"}</StageButton>
        </div>
      </form> : <div className="post-birth-journal__active">
        <label htmlFor="post-birth-display-name">Nome do mascote</label>
        <input id="post-birth-display-name" value={displayName} disabled readOnly />
        <p role="status">Mascote ativo. Esta identidade está confirmada.</p>
        <Link className="stage-button stage-button--primary" href="/meus-mascotes">Ir para Meus Mascotes</Link>
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
