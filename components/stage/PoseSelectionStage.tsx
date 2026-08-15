import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";
import { optionsForRole, POSE_ROLE_LABELS } from "@/lib/mascot-generation/pose-catalog";
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
      <fieldset className="choice-grid pose-choice-grid">
        <legend className="sr-only">Opções para {label}</legend>
        {optionsForRole(role, category).map((option) => (
          <label className="choice-option" key={option.id}>
            <input type="radio" name={`pose-${role}`} checked={selected === option.id} onChange={() => onSelect(option.id)} />
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
  errorMessage,
  onGenerate,
  onBack,
}: {
  choices: PoseChoices;
  enabled: boolean;
  errorMessage?: string;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const labels = Object.fromEntries(optionsForAll().map((option) => [option.id, option.label]));
  return (
    <>
      <span className="state-kicker">Três funções, um personagem</span>
      <h2 id="state-title">Revise os jeitos do seu mascote</h2>
      <StatusMessage
        title="O Master continuará sendo a única referência"
        detail={enabled ? "Ao confirmar, serão geradas exatamente três imagens." : "As escolhas estão prontas. A geração de poses continua bloqueada neste ambiente."}
      />
      <dl className="pose-summary">
        {(Object.keys(choices) as PoseRole[]).map((role) => (
          <div key={role}><dt>{POSE_ROLE_LABELS[role]}</dt><dd>{labels[choices[role]]}</dd></div>
        ))}
      </dl>
      {errorMessage && <p className="stage-error" role="alert">{errorMessage}</p>}
      <div className="stage-actions">
        <StageButton onClick={onGenerate} disabled={!enabled}>Gerar as três poses</StageButton>
        <StageButton tone="secondary" onClick={onBack}>Rever escolhas</StageButton>
      </div>
      {!enabled && <p className="stage-guidance">Nenhuma GPU será acionada enquanto a geração de poses estiver desabilitada.</p>}
    </>
  );
}

function optionsForAll() {
  return (["normal", "listening", "transcribing"] as PoseRole[]).flatMap((role) => optionsForRole(role, "other"));
}
