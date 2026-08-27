"use client";

import { useEffect, useRef, useState } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { optionsForRole, POSE_ROLE_LABELS } from "@/lib/mascot-generation/pose-catalog";
import type { MascotConfiguration, PoseRole, SubjectCategory } from "@/lib/mascot-generation/types";

const roles: PoseRole[] = ["normal", "listening", "transcribing"];
type SaveStatus = "idle" | "saving" | "saved" | "error";

export function MascotConfigurationDialog({
  category,
  configuration,
  masterUrl,
  saving,
  savingField,
  saveStatus,
  configurationReady,
  poseGenerationReady,
  capabilityMessage,
  errorMessage,
  onSaveName,
  onSavePose,
  onGenerate,
  onDismiss,
}: {
  category: SubjectCategory;
  configuration: MascotConfiguration;
  masterUrl: string;
  saving: boolean;
  savingField?: "displayName" | PoseRole;
  saveStatus: SaveStatus;
  configurationReady: boolean;
  poseGenerationReady: boolean;
  capabilityMessage: string;
  errorMessage?: string;
  onSaveName: (name: string) => Promise<boolean>;
  onSavePose: (role: PoseRole, optionId: string) => Promise<boolean>;
  onGenerate: () => void;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [name, setName] = useState(configuration.displayName);
  const [editingRole, setEditingRole] = useState<PoseRole | null>(null);
  const [draftOption, setDraftOption] = useState("");
  const nameValid = isValidName(name);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => returnFocus.current?.focus();
  }, []);

  const dismiss = () => {
    dialogRef.current?.close();
    onDismiss();
  };
  const savingMessage = saveStatus === "saving"
    ? "Salvando suas escolhas…"
    : saveStatus === "saved"
      ? "Configuração salva."
      : saveStatus === "error"
        ? "Não foi possível salvar a última alteração. Revise e tente novamente."
        : "";

  return (
    <dialog
      ref={dialogRef}
      className="mascot-journal"
      aria-labelledby="mascot-journal-title"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
    >
      <div className="mascot-journal__masthead">
        <div className="mascot-journal__brand">
          <p>Puleiro do <strong>GRU</strong></p>
          <span>Edição especial · ficha do mascote</span>
        </div>
        <span className="mascot-journal__seal" aria-hidden="true">Oficial</span>
        <button type="button" className="mascot-journal__close" aria-label="Fechar configurações" onClick={dismiss}>×</button>
      </div>
      <div className="mascot-journal__body">
        <header className="mascot-journal__headline">
          <p className="state-kicker">Notícias do seu mascote</p>
          <h2 id="mascot-journal-title">Configure os jeitos que ele contará</h2>
          <p>O Master aprovado continua protegido como a referência do personagem.</p>
        </header>
        <div className="mascot-journal__edition">
          <aside className="mascot-journal__portrait" aria-label="Master aprovado">
            <p>Retrato do dia</p>
            <figure>
              {masterUrl ? (
                // The authenticated BFF image proxy must not be routed through the public image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={masterUrl} alt="Master aprovado do mascote." />
              ) : <div className="mascot-journal__portrait-empty">Master protegido</div>}
              <figcaption>Master aprovado · referência privada</figcaption>
            </figure>
            <small>As imagens abaixo são referências de pose, não prévias falsas do seu mascote.</small>
          </aside>
          <div className="mascot-journal__desk">
            <form className="mascot-journal__name" onSubmit={(event) => { event.preventDefault(); if (nameValid) void onSaveName(name); }}>
              <label htmlFor="mascot-display-name">Nome do mascote</label>
              <div>
                <input id="mascot-display-name" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} aria-describedby="mascot-name-hint" />
                <button type="submit" disabled={saving || !nameValid || name === configuration.displayName}>Salvar</button>
              </div>
              <small id="mascot-name-hint">De 2 a 32 caracteres. Letras, números, espaço, hífen, apóstrofo e ponto.</small>
            </form>
            <div className="mascot-journal__poses" aria-label="Configurações das poses">
              {roles.map((role) => {
            const current = configuration.poseChoices[role];
            const option = optionsForRole(role, category).find((item) => item.id === current);
            const editing = editingRole === role;
            const fieldSaving = saving && savingField === role;
            return <section className="mascot-journal__pose" key={role}>
              <div className="mascot-journal__pose-summary">
                <span className="pose-reference-preview mascot-journal__reference" style={{ backgroundPosition: option?.previewPosition }} aria-hidden="true" />
                <div><h3>{POSE_ROLE_LABELS[role]}</h3><p>{option?.label ?? "Escolha pendente"}</p><small>Referência de pose</small></div>
                <button type="button" onClick={() => { setEditingRole(role); setDraftOption(current); }} disabled={saving}>Editar</button>
                {fieldSaving && <span className="mascot-journal__field-status" role="status">Salvando…</span>}
              </div>
              {editing && <fieldset className="mascot-journal__editor">
                <legend>Editar {POSE_ROLE_LABELS[role]}</legend>
                <div>
                  {optionsForRole(role, category).map((item) => <label key={item.id}>
                    <input type="radio" name={`journal-${role}`} checked={draftOption === item.id} onChange={() => setDraftOption(item.id)} />
                    <span className="pose-reference-preview" style={{ backgroundPosition: item.previewPosition }} aria-hidden="true" />
                    <span>{item.label}</span>
                  </label>)}
                </div>
                <p><button type="button" onClick={() => setEditingRole(null)} disabled={saving}>Cancelar</button><button type="button" onClick={() => void onSavePose(role, draftOption).then((saved) => saved && setEditingRole(null))} disabled={saving || !draftOption || draftOption === current}>Salvar pose</button></p>
              </fieldset>}
            </section>;
              })}
            </div>
          </div>
        </div>
        {errorMessage && <p className="stage-error" role="alert">{errorMessage}</p>}
        <div className="mascot-journal__status" aria-live="polite">
          <aside className={configurationReady ? "mascot-journal__availability mascot-journal__availability--ready" : "mascot-journal__availability"}>
            <strong>{configurationReady ? "Configuração pronta e salva" : "Complete a configuração"}</strong>
            <span>{configurationReady ? "Nome e as três escolhas estão guardados para o próximo passo." : "Salve um nome válido e as três escolhas de pose."}</span>
          </aside>
          <aside className={poseGenerationReady ? "mascot-journal__availability mascot-journal__availability--ready" : "mascot-journal__availability mascot-journal__availability--blocked"}>
            <strong>{poseGenerationReady ? "Oficina pronta" : "Oficina de poses indisponível"}</strong>
            <span>{poseGenerationReady ? "A geração das três poses poderá começar quando você quiser." : capabilityMessage}</span>
          </aside>
        </div>
        <div className="mascot-journal__actions">
          <StageButton onClick={onGenerate} disabled={!poseGenerationReady || saving}>Gerar as três poses</StageButton>
          {!poseGenerationReady && <p>A configuração está separada da disponibilidade operacional. O botão será liberado automaticamente quando a oficina estiver pronta.</p>}
          {savingMessage && <p className="mascot-journal__save-message" role="status">{savingMessage}</p>}
        </div>
      </div>
    </dialog>
  );
}

function isValidName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length >= 2 && normalized.length <= 32 && /^[\p{L}\p{N} .'-]+$/u.test(normalized);
}
