import { StatusMessage } from "@/components/status/StatusMessage";

export function PreparingStage({ title = "Preparando o nascimento", message = "Criando o mascote mestre…" }: { title?: string; message?: string }) {
  return (
    <>
      <span className="state-kicker">Ovo no ninho</span>
      <h2 id="state-title">{title}</h2>
      <StatusMessage title={message} detail="O Puleiro está cuidando dos detalhes. Aguarde só um instante." />
      <p className="stage-guidance">Você não precisa fazer nada enquanto o ovo é preparado.</p>
    </>
  );
}
