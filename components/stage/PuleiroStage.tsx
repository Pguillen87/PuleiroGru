import Image from "next/image";
import type { ReactNode } from "react";
import type { PuleiroState } from "@/lib/puleiro-state";

const images: Record<PuleiroState, { src: string; alt: string }> = {
  entry: {
    src: "/assets/puleiro-entry.jpg",
    alt: "Portão de madeira do Puleiro do GRU aberto para um caminho entre cercas e colinas rurais.",
  },
  preparing: {
    src: "/assets/puleiro-preparing-canonical.jpg",
    alt: "Ovo claro repousando em um ninho de palha e penas no palco de madeira do Puleiro.",
  },
  revealing: {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote galo em estilo cartoon editorial surgindo no palco iluminado do celeiro.",
  },
  revealed: {
    src: "/assets/puleiro-reveal.jpg",
    alt: "Mascote galo em estilo cartoon editorial, com roupa rural, revelado dentro do celeiro.",
  },
};

type PuleiroStageProps = {
  state: PuleiroState;
  children: ReactNode;
};

export function PuleiroStage({ state, children }: PuleiroStageProps) {
  const image = images[state];

  return (
    <section id="puleiro-stage" className={`stage stage--${state}`} aria-labelledby="state-title">
      <div className="stage__art">
        <Image
          key={state}
          src={image.src}
          alt={image.alt}
          fill
          sizes="(max-width: 1023px) 100vw, 68vw"
          loading="eager"
        />
        {state === "preparing" && <span className="egg-glow" aria-hidden="true" />}
        {state === "revealing" && (
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
