import type { ReactNode } from "react";
import type { PuleiroState } from "@/lib/puleiro-state";
import type { GenerationProgressModel } from "@/components/status/GenerationProgress";

const images: Record<PuleiroState, { src: string; alt: string }> = {
  entry: {
    src: "/assets/puleiro-entry.jpg",
    alt: "Portão de madeira do Puleiro do GRU aberto para um caminho entre cercas e colinas rurais.",
  },
  "photo-selection": {
    src: "/assets/puleiro-entry.jpg",
    alt: "Caminho rural do Puleiro aguardando a foto do pet.",
  },
  "photo-preview": {
    src: "/assets/puleiro-entry.jpg",
    alt: "Prévia da fotografia escolhida para criar o mascote.",
  },
  uploading: {
    src: "/assets/puleiro-preparing-canonical.jpg",
    alt: "Ovo claro repousando em um ninho de palha e penas no palco de madeira do Puleiro.",
  },
  "creating-job": {
    src: "/assets/puleiro-preparing-canonical.jpg",
    alt: "Ovo claro repousando em um ninho enquanto o nascimento é iniciado.",
  },
  preparing: {
    src: "/assets/puleiro-preparing-canonical.jpg",
    alt: "Ovo claro repousando em um ninho de palha e penas no palco de madeira do Puleiro.",
  },
  "subject-confirmation": {
    src: "/assets/puleiro-entry.jpg",
    alt: "Fotografia pronta para a confirmação do sujeito principal do mascote.",
  },
  "registered-safe": {
    src: "/assets/puleiro-preparing-canonical.jpg",
    alt: "Ovo seguro no ninho; o nascimento foi registrado sem iniciar a geração.",
  },
  "master-ready": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote mestre revelado dentro do celeiro do Puleiro.",
  },
  "master-approved": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote mestre aprovado no palco do Puleiro.",
  },
  "master-rejected": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote mestre aguardando uma nova decisão.",
  },
  "choosing-normal": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote mestre no palco durante a escolha de sua pose normal.",
  },
  "choosing-listening": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote mestre no palco durante a escolha de seu gesto de escuta.",
  },
  "choosing-transcribing": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote mestre no palco durante a escolha de seu gesto de transcrição.",
  },
  "pose-selection-review": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote mestre aguardando a revisão das três poses escolhidas.",
  },
  "generating-poses": {
    src: "/assets/puleiro-preparing-canonical.jpg",
    alt: "Palco do Puleiro preparando as três poses do mascote.",
  },
  "pose-set-ready": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote com seu conjunto de três poses concluído.",
  },
  "saving-library": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote concluído no celeiro enquanto sua biblioteca privada é preparada.",
  },
  "code-ready": {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote concluído no palco do Puleiro, pronto para sua biblioteca privada.",
  },
  "recoverable-error": {
    src: "/assets/puleiro-preparing-canonical.jpg",
    alt: "Ovo seguro no ninho enquanto o Puleiro aguarda uma nova tentativa.",
  },
};

type PuleiroStageProps = {
  state: PuleiroState;
  children: ReactNode;
  artwork?: { src: string; alt: string };
  revealing?: boolean;
  onArtworkError?: () => void;
  progress?: GenerationProgressModel;
};

export function PuleiroStage({ state, children, artwork, revealing = false, onArtworkError, progress }: PuleiroStageProps) {
  const image = artwork ?? images[state];
  const preparing = ["uploading", "creating-job", "preparing", "registered-safe", "generating-poses"].includes(state);
  const revealed = ["master-ready", "master-approved", "master-rejected", "choosing-normal", "choosing-listening", "choosing-transcribing", "pose-selection-review", "pose-set-ready", "saving-library", "code-ready"].includes(state);
  const compactViewport = ["entry", "photo-selection", "uploading", "creating-job", "preparing", "registered-safe", "master-ready", "master-rejected", "generating-poses", "saving-library", "code-ready"].includes(state);

  return (
    <section
      id="puleiro-stage"
      className={`stage stage--${preparing ? "preparing" : revealed ? "revealed" : state} stage-state--${state}${compactViewport ? " stage--compact-viewport" : ""}${state === "generating-poses" ? " stage--master-reference" : ""}`}
      aria-labelledby="state-title"
    >
      <div className="stage__art">
        {/* Imagens locais, blobs de prévia e proxy privado usam a mesma moldura sem otimização externa. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={state}
          src={image.src}
          alt={image.alt}
          className="stage__image"
          onError={onArtworkError}
        />
        {preparing && <span className="egg-glow" aria-hidden="true" />}
        {progress?.kind === "birth" && (
          <div className={`incubation-motion incubation-motion--${progress.percent}`} aria-hidden="true">
            <span className="egg-crack egg-crack--one" />
            <span className="egg-crack egg-crack--two" />
            <span className="stage-progress-seal">{progress.percent}%</span>
          </div>
        )}
        {progress?.kind === "poses" && (
          <div className="pose-workshop-motion" aria-hidden="true">
            <span className="pose-workshop-motion__light" />
            <ol>
              <li><span>01</span> Normal</li>
              <li><span>02</span> Ouvindo</li>
              <li><span>03</span> Transcrevendo</li>
            </ol>
            <strong>{progress.percent}%</strong>
          </div>
        )}
        {revealing && (
          <div className="reveal-effects" aria-hidden="true">
            <span className="curtain curtain--left" />
            <span className="curtain curtain--right" />
            <span className="feather feather--one">⌁</span>
            <span className="feather feather--two">⌁</span>
            <span className="feather feather--three">⌁</span>
          </div>
        )}
      </div>
      <div className="stage__content">{children}</div>
    </section>
  );
}
