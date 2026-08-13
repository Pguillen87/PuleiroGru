import { StatusMessage } from "@/components/status/StatusMessage";

export function PreparingStage() {
  return (
    <>
      <span className="state-kicker">Ovo no ninho</span>
      <h2 id="state-title">Preparando o nascimento</h2>
      <StatusMessage title="Criando seu mascote" detail="O Puleiro está cuidando dos detalhes. Aguarde só um instante." />
      <p className="stage-guidance">Você não precisa fazer nada enquanto o ovo é preparado.</p>
    </>
  );
}
