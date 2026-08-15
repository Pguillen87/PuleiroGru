import type { PuleiroState } from "@/lib/puleiro-state";
import { stageNumber } from "@/lib/puleiro-state";

const labels: Record<PuleiroState, string> = {
  entry: "Entrada",
  "photo-selection": "Fotografia",
  "photo-preview": "Fotografia",
  "subject-confirmation": "Identidade",
  uploading: "Incubação",
  "creating-job": "Incubação",
  preparing: "Incubação",
  "registered-safe": "Incubação",
  "master-ready": "Nascimento",
  "master-approved": "Nascimento",
  "master-rejected": "Nascimento",
  "choosing-normal": "Poses",
  "choosing-listening": "Poses",
  "choosing-transcribing": "Poses",
  "pose-selection-review": "Poses",
  "generating-poses": "Poses",
  "pose-set-ready": "Poses",
  "recoverable-error": "Incubação",
};

export function ProgressFolio({ state }: { state: PuleiroState }) {
  return (
    <aside className="progress-folio" aria-label={`Etapa atual: ${labels[state]}`}>
      <span>Etapa atual</span>
      <strong>{stageNumber[state]} <span aria-hidden="true">/ 05</span></strong>
      <small>{labels[state]}</small>
    </aside>
  );
}

export function EditorialNote({ state }: { state: PuleiroState }) {
  const copy = {
    entry: "Siga o caminho para começar. O portão marca a entrada deste pequeno universo.",
    "photo-selection": "Uma boa fotografia dá ao Puleiro matéria suficiente para imaginar seu mascote.",
    "photo-preview": "A fotografia só deixa seu dispositivo depois que você confirmar esta escolha.",
    "subject-confirmation": "A categoria confirmada protege a identidade: pessoa continua pessoa, animal preserva a espécie e objeto mantém sua natureza.",
    uploading: "A fotografia está atravessando o portão protegido da API do Puleiro.",
    "creating-job": "O pedido recebeu uma identidade própria para poder ser acompanhado com segurança.",
    preparing: "O trabalho acontece nos bastidores. O texto informa o estágio sem inventar porcentagens.",
    "registered-safe": "Este nascimento ficou guardado. Nada novo começa sozinho enquanto o Puleiro aguarda a próxima etapa.",
    "master-ready": "O palco desacelera. Agora existe uma única escolha: ficar com este mascote ou ver outro.",
    "master-approved": "A escolha ficou registrada para esta conta. As próximas poses pertencem a uma fase futura.",
    "master-rejected": "Outra geração só começa quando você confirmar; nenhuma tentativa é disparada sozinha.",
    "choosing-normal": "Primeiro, escolha a postura natural. Nenhuma imagem nova é gerada durante esta decisão.",
    "choosing-listening": "Depois, escolha um gesto de escuta que funcione para a anatomia do mascote.",
    "choosing-transcribing": "Por fim, escolha como o mascote representa o trabalho de transcrição.",
    "pose-selection-review": "As três decisões ficam reunidas para revisão antes de qualquer geração.",
    "generating-poses": "Exatamente três imagens são derivadas do Master aprovado, uma para cada função.",
    "pose-set-ready": "O conjunto preserva um único personagem nas funções normal, ouvindo e transcrevendo.",
    "recoverable-error": "O Puleiro preserva o que já foi registrado e explica quando a fotografia precisa ser escolhida novamente.",
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
