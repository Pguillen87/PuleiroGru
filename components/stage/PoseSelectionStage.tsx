import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";
import { optionsForRole, POSE_OPTIONS, POSE_ROLE_LABELS } from "@/lib/mascot-generation/pose-catalog";
import type { PoseChoices, PoseRole, SubjectCategory } from "@/lib/mascot-generation/types";

export function PoseSelectionStage({
  role,
  category,
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  role: PoseRole;
  category: SubjectCategory;
  selected: string;
  onSelect: (optionId: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const label = POSE_ROLE_LABELS[role];
  return (
    <>
      <span className="state-kicker">Escolha das poses · {label}</span>
      <h2 id="state-title">Como ele fica quando está {role === "normal" ? "pronto" : label.toLowerCase()}?</h2>
      <StatusMessage title={`Função ${label}`} detail="Escolha o gesto. A imagem personalizada será criada somente depois da revisão das três funções." />
      <p className="pose-reference-note">As imagens abaixo são referências de movimento. O resultado usará a identidade do seu mascote.</p>
      <fieldset className="choice-grid pose-choice-grid">
        <legend className="sr-only">Opções para {label}</legend>
        {optionsForRole(role, category).map((option) => (
          <label className="choice-option" key={option.id}>
            <input type="radio" name={`pose-${role}`} checked={selected === option.id} onChange={() => onSelect(option.id)} />
            <span
              className="pose-reference-preview"
              style={{ backgroundPosition: option.previewPosition }}
              aria-hidden="true"
            />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="stage-actions">
        <StageButton onClick={onContinue} disabled={!selected}>Continuar</StageButton>
        <StageButton tone="secondary" onClick={onBack}>Voltar</StageButton>
      </div>
    </>
  );
}

export function PoseSelectionReviewStage({
  choices,
  enabled,
  capabilityMessage,
  errorMessage,
  onGenerate,
  onBack,
}: {
  choices: PoseChoices;
  enabled: boolean;
  capabilityMessage: string;
  errorMessage?: string;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const selectedOptions = Object.fromEntries(POSE_OPTIONS.map((option) => [option.id, option]));
  return (
    <>
      <span className="state-kicker">Três funções, um personagem</span>
      <h2 id="state-title">Revise os jeitos do seu mascote</h2>
      <StatusMessage
        title="O Master continuará sendo a única referência"
        detail={capabilityMessage}
      />
      <dl className="pose-summary">
        {(Object.keys(choices) as PoseRole[]).map((role) => (
          <div key={role}>
            <dt>{POSE_ROLE_LABELS[role]}</dt>
            <dd>
              <span
                className="pose-reference-preview pose-reference-preview--summary"
                style={{ backgroundPosition: selectedOptions[choices[role]]?.previewPosition }}
                aria-hidden="true"
              />
              <span>{selectedOptions[choices[role]]?.label}</span>
            </dd>
          </div>
        ))}
      </dl>
      {errorMessage && <p className="stage-error" role="alert">{errorMessage}</p>}
      <div className="stage-actions">
        <StageButton onClick={onGenerate} disabled={!enabled}>Gerar as três poses</StageButton>
        <StageButton tone="secondary" onClick={onBack}>Rever escolhas</StageButton>
      </div>
      {!enabled && <p className="stage-guidance">Suas escolhas permanecem salvas; nenhuma geração será iniciada sem capacidade confirmada.</p>}
    </>
  );
}
