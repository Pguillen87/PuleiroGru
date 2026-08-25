import { useEffect, useState } from "react";

export type GenerationProgressModel = {
  kind: "birth" | "poses";
  phase: "received" | "registered" | "working" | "confirmed";
  label: string;
  startedAt?: number;
};

export function GenerationProgress({ progress }: { progress: GenerationProgressModel }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsedMs = progress.startedAt ? Math.max(0, now - progress.startedAt) : undefined;
  return (
    <div className="generation-progress">
      <div className="generation-progress__heading">
        <span>{progress.label}</span>
        <strong>Ao vivo</strong>
      </div>
      <div
        className="generation-progress__track"
        role="status"
        aria-label={progress.label}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className={`generation-progress__signal generation-progress__signal--${progress.phase}`} />
      </div>
      <small>
        {elapsedMs === undefined
          ? "Avanço confirmado pelo Puleiro."
          : `${formatElapsed(elapsedMs)} decorridos · estágio confirmado pelo Puleiro.`}
      </small>
    </div>
  );
}

function formatElapsed(value: number) {
  const seconds = Math.floor(value / 1_000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
