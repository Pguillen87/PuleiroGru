import { useEffect, useState, type CSSProperties } from "react";

export type GenerationProgressModel = {
  kind: "birth" | "poses";
  percent: number;
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
        <strong>{elapsedMs === undefined ? `${progress.percent}%` : formatElapsed(elapsedMs)}</strong>
      </div>
      <div
        className="generation-progress__track"
        role="progressbar"
        aria-label={progress.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={`${progress.percent}% dos marcos confirmados${elapsedMs === undefined ? "" : `; ${formatElapsed(elapsedMs)} decorridos`}`}
      >
        <span style={{ "--progress-scale": progress.percent / 100 } as CSSProperties} />
      </div>
      <small>{elapsedMs === undefined ? "Avanço confirmado pelo Puleiro." : "Tempo decorrido ao vivo. A previsão aparece quando houver histórico suficiente."}</small>
    </div>
  );
}

function formatElapsed(value: number) {
  const seconds = Math.floor(value / 1_000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
