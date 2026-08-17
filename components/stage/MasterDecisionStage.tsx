import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";

type MasterDecisionStageProps = {
  mode: "ready" | "approved";
  position?: string;
  onAccept: () => void;
  onNext: () => void;
  onReloadImage?: () => void;
  errorMessage?: string;
};

export function MasterDecisionStage(props: MasterDecisionStageProps) {
  if (props.mode === "approved") return (
    <>
      <span className="state-kicker">Escolha registrada</span>
      <h2 id="state-title">Este é o seu mascote mestre</h2>
      <StatusMessage title="Mascote mestre aprovado" detail="A aprovação não iniciou poses, empacotamento ou qualquer nova geração." />
    </>
  );

  return (
    <>
      <span className="state-kicker">Nascimento concluído {props.position && `· opção ${props.position}`}</span>
      <h2 id="state-title">Seu mascote chegou!</h2>
      <StatusMessage title="Três opções, uma única geração" detail="Veja as opções já criadas e escolha seu mascote mestre sem iniciar outro custo." />
      {props.errorMessage && (
        <>
          <p className="stage-error" role="alert">{props.errorMessage}</p>
          {props.onReloadImage && <StageButton tone="secondary" onClick={props.onReloadImage}>Recarregar imagem</StageButton>}
        </>
      )}
      <div className="stage-actions" aria-label="Escolha do mascote">
        <StageButton onClick={props.onAccept}>Gostei deste</StageButton>
        <StageButton tone="secondary" onClick={props.onNext}>Ver outra opção</StageButton>
      </div>
    </>
  );
}
