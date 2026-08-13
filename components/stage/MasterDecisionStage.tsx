import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";

type MasterDecisionStageProps = {
  mode: "ready" | "approved" | "rejected";
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
  onChange: () => void;
};

export function MasterDecisionStage(props: MasterDecisionStageProps) {
  if (props.mode === "approved") return (
    <>
      <span className="state-kicker">Escolha registrada</span>
      <h2 id="state-title">Este é o seu mascote mestre</h2>
      <StatusMessage title="Aprovado nesta sessão" detail="A escolha é local nesta fase; poses e salvamento permanente ainda não foram criados." />
    </>
  );

  if (props.mode === "rejected") return (
    <>
      <span className="state-kicker">Nova tentativa</span>
      <h2 id="state-title">Quer abrir outro ovo?</h2>
      <StatusMessage title="A foto continua aqui" detail="Confirme para gerar outra opção ou troque a fotografia." />
      <div className="stage-actions">
        <StageButton onClick={props.onRetry}>Gerar outra opção</StageButton>
        <StageButton tone="secondary" onClick={props.onChange}>Trocar foto</StageButton>
      </div>
    </>
  );

  return (
    <>
      <span className="state-kicker">Nascimento concluído</span>
      <h2 id="state-title">Seu mascote chegou!</h2>
      <StatusMessage title="Mascote mestre pronto" detail="Agora você pode escolher este resultado ou preparar outra tentativa." />
      <div className="stage-actions" aria-label="Escolha do mascote">
        <StageButton onClick={props.onAccept}>Gostei deste</StageButton>
        <StageButton tone="secondary" onClick={props.onReject}>Ver outra opção</StageButton>
      </div>
    </>
  );
}
