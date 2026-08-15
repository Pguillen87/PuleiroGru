import { StatusMessage } from "@/components/status/StatusMessage";
import type { ReactNode } from "react";

type PreparingStageProps = {
  title?: string;
  message?: string;
  detail?: string;
  guidance?: string;
  action?: ReactNode;
};

export function PreparingStage({
  title = "Preparando o nascimento",
  message = "Criando o mascote mestre…",
  detail = "O Puleiro está cuidando dos detalhes. Aguarde só um instante.",
  guidance = "Você não precisa fazer nada enquanto o ovo é preparado.",
  action,
}: PreparingStageProps) {
  return (
    <>
      <span className="state-kicker">Ovo no ninho</span>
      <h2 id="state-title">{title}</h2>
      <StatusMessage title={message} detail={detail} />
      <p className="stage-guidance">{guidance}</p>
      {action}
    </>
  );
}
