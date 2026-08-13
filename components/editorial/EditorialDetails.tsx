import type { PuleiroState } from "@/lib/puleiro-state";
import { stageNumber } from "@/lib/puleiro-state";

const labels: Record<PuleiroState, string> = {
  entry: "Entrada",
  "photo-selection": "Fotografia",
  "photo-preview": "Fotografia",
  uploading: "Incubação",
  "creating-job": "Incubação",
  preparing: "Incubação",
  "master-ready": "Nascimento",
  "master-approved": "Nascimento",
  "master-rejected": "Nascimento",
  "recoverable-error": "Incubação",
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
    "photo-selection": "Uma boa fotografia dá ao Puleiro matéria suficiente para imaginar seu mascote.",
    "photo-preview": "A fotografia só deixa seu dispositivo depois que você confirmar esta escolha.",
    uploading: "A fotografia está atravessando o portão protegido da API do Puleiro.",
    "creating-job": "O pedido recebeu uma identidade própria para poder ser acompanhado com segurança.",
    preparing: "O trabalho acontece nos bastidores. O texto informa o estágio sem inventar porcentagens.",
    "master-ready": "O palco desacelera. Agora existe uma única escolha: ficar com este mascote ou ver outro.",
    "master-approved": "A aprovação fica nesta sessão. As próximas poses pertencem a uma fase futura.",
    "master-rejected": "Outra geração só começa quando você confirmar; nenhuma tentativa é disparada sozinha.",
    "recoverable-error": "A falha não apaga sua fotografia nem expõe detalhes técnicos. O próximo passo continua claro.",
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
