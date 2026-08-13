import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";

export function EntryStage({ onStart }: { onStart: () => void }) {
  return (
    <>
      <span className="state-kicker">Bem-vindo ao Puleiro</span>
      <h2 id="state-title">O lugar onde os mascotes do GRU nascem.</h2>
      <StatusMessage title="Portão aberto" detail="Sua jornada de nascimento começa aqui." />
      <StageButton onClick={onStart}>Criar meu mascote</StageButton>
    </>
  );
}
