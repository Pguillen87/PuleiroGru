import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";

type RevealStageProps = {
  onAccept: () => void;
  onAnother: () => void;
};

export function RevealStage({ onAccept, onAnother }: RevealStageProps) {
  return (
    <>
      <span className="state-kicker">Nascimento concluído</span>
      <h2 id="state-title">Seu mascote chegou!</h2>
      <StatusMessage title="Mascote pronto" detail="Ele já pode ser visto e escolhido." />
      <div className="stage-actions" aria-label="Escolha do mascote">
        <StageButton onClick={onAccept}>Gostei deste</StageButton>
        <StageButton tone="secondary" onClick={onAnother}>Ver outra opção</StageButton>
      </div>
    </>
  );
}
