import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";

export function ErrorStage({ message, canRetry, pendingConfirmation = false, onRetry, onResume, onChange }: {
  message: string;
  canRetry: boolean;
  pendingConfirmation?: boolean;
  onRetry: () => void;
  onResume: () => void;
  onChange: () => void;
}) {
  return (
    <>
      <span className="state-kicker">O ninho continua seguro</span>
      <h2 id="state-title">{pendingConfirmation ? "Seu nascimento continua registrado" : "Este nascimento precisa de outra tentativa"}</h2>
      <StatusMessage title={pendingConfirmation ? "Confirmando o registro" : "Não conseguimos concluir"} detail={message} />
      <p className="stage-guidance">
        {pendingConfirmation
          ? "Retome com segurança. O Puleiro não enviará um novo pedido."
          : canRetry ? "Sua foto continua aqui. Você pode tentar novamente ou escolher outra." : "Escolha outra foto para continuar o nascimento."}
      </p>
      <div className="stage-actions">
        {pendingConfirmation
          ? <StageButton onClick={onResume}>Retomar nascimento</StageButton>
          : canRetry && <StageButton onClick={onRetry}>Tentar novamente</StageButton>}
        <StageButton tone="secondary" onClick={onChange}>Trocar foto</StageButton>
      </div>
    </>
  );
}
