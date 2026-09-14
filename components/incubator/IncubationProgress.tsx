"use client";

import type { IncubationSummary } from "@/lib/mascot-generation/types";
import { incubationProgress, type IncubationTiming } from "@/lib/mascot-generation/incubation-progress";

export function IncubationProgress({ item, timing, now }: { item: IncubationSummary; timing: IncubationTiming; now: number }) {
  const progress = incubationProgress(item, timing, now);
  if (!progress) return null;
  return <div className="incubation-progress">
    <progress max={100} value={progress.percent ?? undefined} aria-label={progress.percent === 100 ? "Preparação concluída" : "Progresso estimado da incubação"} />
    <p>{progress.message}</p>
    {timing.sampleCount >= 3 && progress.percent !== 100 && <small>Base: últimas {timing.sampleCount} incubações concluídas. O tempo pode variar.</small>}
  </div>;
}
