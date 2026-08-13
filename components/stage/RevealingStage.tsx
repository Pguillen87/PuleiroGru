import { StatusMessage } from "@/components/status/StatusMessage";

export function RevealingStage() {
  return (
    <>
      <span className="state-kicker">Geração concluída</span>
      <h2 id="state-title">O nascimento começou</h2>
      <StatusMessage title="Nascimento em andamento" detail="O palco está revelando seu mascote." />
    </>
  );
}
