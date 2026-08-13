import { StatusMessage } from "@/components/status/StatusMessage";

type PreparingStageProps = {
  title?: string;
  message?: string;
  detail?: string;
  guidance?: string;
};

export function PreparingStage({
  title = "Preparando o nascimento",
  message = "Criando o mascote mestre…",
  detail = "O Puleiro está cuidando dos detalhes. Aguarde só um instante.",
  guidance = "Você não precisa fazer nada enquanto o ovo é preparado.",
}: PreparingStageProps) {
  return (
    <>
      <span className="state-kicker">Ovo no ninho</span>
      <h2 id="state-title">{title}</h2>
      <StatusMessage title={message} detail={detail} />
      <p className="stage-guidance">{guidance}</p>
    </>
  );
}
