import type { PuleiroState } from "@/lib/puleiro-state";
import { stageNumber } from "@/lib/puleiro-state";

const labels: Record<PuleiroState, string> = {
  entry: "Entrada",
  preparing: "Incubação",
  revealing: "Nascimento",
  revealed: "Nascimento",
};

export function ProgressFolio({ state }: { state: PuleiroState }) {
  return (
    <aside className="progress-folio" aria-label={`Etapa atual: ${labels[state]}`}>
      <span>Etapa atual</span>
      <strong>{stageNumber[state]} <span aria-hidden="true">/ 03</span></strong>
      <small>{labels[state]}</small>
    </aside>
  );
}

export function EditorialNote({ state }: { state: PuleiroState }) {
  const copy = {
    entry: "Siga o caminho para começar. O portão marca a entrada deste pequeno universo.",
    preparing: "O trabalho acontece nos bastidores. O texto informa o estágio sem inventar porcentagens.",
    revealing: "A geração terminou. O palco assume o momento e nenhuma decisão aparece antes da hora.",
    revealed: "O palco desacelera. Agora existe uma única escolha: ficar com este mascote ou ver outro.",
  }[state];

  return (
    <aside className="editorial-note">
      <span className="editorial-note__seal" aria-hidden="true">✦</span>
      <div>
        <strong>Nota do Puleiro</strong>
        <p>{copy}</p>
      </div>
    </aside>
  );
}
