"use client";

import { useEffect, useRef, useState } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { optionsForRole, POSE_ROLE_LABELS } from "@/lib/mascot-generation/pose-catalog";
import type { MascotConfiguration, PoseRole, SubjectCategory } from "@/lib/mascot-generation/types";

const roles: PoseRole[] = ["normal", "listening", "transcribing"];

export function MascotConfigurationDialog({
  category,
  configuration,
  saving,
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
  saving: boolean;
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

  return (
    <dialog
      ref={dialogRef}
      className="mascot-journal"
      aria-labelledby="mascot-journal-title"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
    >
      <div className="mascot-journal__masthead">
        <div>
          <p>Puleiro do <strong>GRU</strong></p>
          <span>Edição especial · configuração do mascote</span>
        </div>
        <button type="button" className="mascot-journal__close" aria-label="Fechar configurações" onClick={dismiss}>×</button>
      </div>
      <div className="mascot-journal__body">
        <header>
          <p className="state-kicker">Notícias do seu mascote</p>
          <h2 id="mascot-journal-title">Configure os jeitos que ele contará</h2>
          <p>O Master aprovado continua protegido como a referência do personagem.</p>
        </header>
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
            return <section className="mascot-journal__pose" key={role}>
              <div className="mascot-journal__pose-summary">
                <span className="pose-reference-preview mascot-journal__reference" style={{ backgroundPosition: option?.previewPosition }} aria-hidden="true" />
                <div><h3>{POSE_ROLE_LABELS[role]}</h3><p>{option?.label ?? "Escolha pendente"}</p></div>
                <button type="button" onClick={() => { setEditingRole(role); setDraftOption(current); }} disabled={saving}>Editar</button>
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
        {errorMessage && <p className="stage-error" role="alert">{errorMessage}</p>}
        <aside className={poseGenerationReady ? "mascot-journal__availability mascot-journal__availability--ready" : "mascot-journal__availability"} aria-live="polite">
          <strong>{poseGenerationReady ? "Tudo pronto para a oficina" : "Oficina de poses indisponível"}</strong>
          <span>{poseGenerationReady ? "As três escolhas foram salvas e poderão ser geradas juntas." : capabilityMessage}</span>
        </aside>
        <div className="mascot-journal__actions">
          <StageButton onClick={onGenerate} disabled={!poseGenerationReady || saving}>Gerar as três poses</StageButton>
          {!poseGenerationReady && <p>O botão será liberado quando a capacidade operacional e a configuração estiverem prontas.</p>}
        </div>
      </div>
    </dialog>
  );
}

function isValidName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length >= 2 && normalized.length <= 32 && /^[\p{L}\p{N} .'-]+$/u.test(normalized);
}
