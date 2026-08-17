import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";

export function ErrorStage({ message, canRetry, onRetry, onChange }: { message: string; canRetry: boolean; onRetry: () => void; onChange: () => void }) {
  return (
    <>
      <span className="state-kicker">O ninho continua seguro</span>
      <h2 id="state-title">Este nascimento precisa de outra tentativa</h2>
      <StatusMessage title="Não conseguimos concluir" detail={message} />
      <p className="stage-guidance">
        {canRetry ? "Sua foto continua aqui. Você pode tentar novamente ou escolher outra." : "Escolha outra foto para continuar o nascimento."}
      </p>
      <div className="stage-actions">
        {canRetry && <StageButton onClick={onRetry}>Tentar novamente</StageButton>}
        <StageButton tone="secondary" onClick={onChange}>Trocar foto</StageButton>
      </div>
    </>
  );
}
