import type { CSSProperties } from "react";

export type GenerationProgressModel = {
  kind: "birth" | "poses";
  percent: number;
  label: string;
};

export function GenerationProgress({ progress }: { progress: GenerationProgressModel }) {
  return (
    <div className="generation-progress">
      <div className="generation-progress__heading">
        <span>{progress.label}</span>
        <strong>{progress.percent}%</strong>
      </div>
      <div
        className="generation-progress__track"
        role="progressbar"
        aria-label={progress.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={`${progress.percent}% dos marcos confirmados`}
      >
        <span style={{ "--progress-scale": progress.percent / 100 } as CSSProperties} />
      </div>
      <small>Avanço confirmado pelo Puleiro — não é uma estimativa de tempo.</small>
    </div>
  );
}
