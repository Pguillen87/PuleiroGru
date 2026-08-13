"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/navigation/Header";
import { EditorialNote, ProgressFolio } from "@/components/editorial/EditorialDetails";
import { EntryStage } from "@/components/stage/EntryStage";
import { PreparingStage } from "@/components/stage/PreparingStage";
import { PuleiroStage } from "@/components/stage/PuleiroStage";
import { RevealingStage } from "@/components/stage/RevealingStage";
import { RevealStage } from "@/components/stage/RevealStage";
import {
  PREPARATION_DURATION_MS,
  REDUCED_REVEAL_DURATION_MS,
  REVEAL_DURATION_MS,
  type PuleiroState,
} from "@/lib/puleiro-state";

export function PuleiroExperience() {
  const [state, setState] = useState<PuleiroState>("entry");
  const [announcement, setAnnouncement] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const beginPreparation = () => {
    if (timer.current) clearTimeout(timer.current);
    setAnnouncement("");
    setState("preparing");
    timer.current = setTimeout(() => {
      setState("revealing");
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      timer.current = setTimeout(
        () => setState("revealed"),
        prefersReducedMotion ? REDUCED_REVEAL_DURATION_MS : REVEAL_DURATION_MS,
      );
    }, PREPARATION_DURATION_MS);
  };

  const handleAccept = () => setAnnouncement("Mascote escolhido nesta demonstração.");

  const stageContent = {
    entry: <EntryStage onStart={beginPreparation} />,
    preparing: <PreparingStage />,
    revealing: <RevealingStage />,
    revealed: <RevealStage onAccept={handleAccept} onAnother={beginPreparation} />,
  }[state];

  return (
    <div className="site-shell">
      <Header onUnavailableNavigation={(destination) => setAnnouncement(`${destination} estará disponível em uma próxima etapa.`)} />
      <main>
        <h1 className="sr-only">Puleiro do GRU</h1>
        <div className="experience-layout">
          <ProgressFolio state={state} />
          <PuleiroStage state={state}>{stageContent}</PuleiroStage>
          <EditorialNote state={state} />
        </div>
        <p
          className={announcement ? "system-feedback" : "sr-only"}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </p>
      </main>
      <footer>
        <span>Puleiro do GRU</span>
        <span>Fonte visual oficial · Stitch</span>
      </footer>
    </div>
  );
}
