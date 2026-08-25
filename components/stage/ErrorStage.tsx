import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";

export type ErrorStageMode = "service-unavailable" | "resume-only" | "photo-only" | "recoverable";

export function ErrorStage({ message, mode, onResume, onChange, onBack }: {
  message: string;
  mode: ErrorStageMode;
  onResume: () => void;
  onChange: () => void;
  onBack: () => void;
}) {
  const resumeOnly = mode === "resume-only";
  const unavailable = mode === "service-unavailable";
  const photoOnly = mode === "photo-only";
  return (
    <>
      <span className="state-kicker">O ninho continua seguro</span>
      <h2 id="state-title">{resumeOnly ? "Seu nascimento continua registrado" : unavailable ? "O Puleiro está em pausa" : "Este nascimento precisa de atenção"}</h2>
      <StatusMessage title={resumeOnly ? "Continua em andamento" : unavailable ? "Indisponibilidade temporária" : "Não conseguimos concluir agora"} detail={message} />
      <p className="stage-guidance">
        {resumeOnly
          ? "Retome com segurança. O Puleiro consultará a mesma tentativa e não enviará outra foto."
          : unavailable ? "Nenhum nascimento foi iniciado. Volte mais tarde para tentar de novo."
          : photoOnly ? "A foto não pôde ser preparada. Escolha outra para continuar."
          : "O nascimento permanece salvo quando possível. Consulte-o novamente antes de iniciar algo novo."}
      </p>
      <div className="stage-actions">
        {resumeOnly
          ? <StageButton onClick={onResume}>Retomar nascimento</StageButton>
          : !unavailable && !photoOnly && <StageButton onClick={onResume}>Consultar nascimento</StageButton>}
        {photoOnly && <StageButton tone="secondary" onClick={onChange}>Trocar foto</StageButton>}
        {unavailable && <StageButton tone="secondary" onClick={onBack}>Voltar ao Puleiro</StageButton>}
      </div>
    </>
  );
}
