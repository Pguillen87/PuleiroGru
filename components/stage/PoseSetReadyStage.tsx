import { useState } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";
import { POSE_ROLE_LABELS } from "@/lib/mascot-generation/pose-catalog";
import type { GeneratedPose } from "@/lib/mascot-generation/types";

export function PoseSetReadyStage({ poses, errorMessage, onSave }: { poses: GeneratedPose[]; errorMessage?: string; onSave: (displayName: string) => void }) {
  const [displayName, setDisplayName] = useState("");
  const canSave = displayName.trim().length >= 2;
  return (
    <>
      <span className="state-kicker">Três funções, uma identidade</span>
      <h2 id="state-title">Os três jeitos chegaram</h2>
      <StatusMessage
        title="Conjunto criado a partir do Master"
        detail="Compare as três imagens e confirme visualmente que continuam sendo o mesmo personagem."
      />
      <section className="generated-pose-section" aria-labelledby="generated-poses-title">
        <h3 id="generated-poses-title" className="sr-only">Poses geradas do mascote</h3>
        <ul className="generated-pose-grid">
        {poses.map((pose) => (
          <li key={pose.id}>
          <figure>
            {/* O proxy privado já valida ownership e tipo antes de servir a imagem. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pose.imageUrl} alt={`Mascote ${POSE_ROLE_LABELS[pose.role]}, ${pose.label}.`} />
            <figcaption>
              <strong>{POSE_ROLE_LABELS[pose.role]}</strong>
              <span>{pose.label}</span>
            </figcaption>
          </figure>
          </li>
        ))}
        </ul>
      </section>
      <label className="subject-description">
        <span>Nome do mascote</span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={32} autoComplete="off" placeholder="Ex.: Quiron" required />
        <small>Ele aparecerá no Puleiro e no aplicativo GRU.</small>
      </label>
      {errorMessage && <p className="stage-error" role="alert">{errorMessage}</p>}
      <div className="stage-actions"><StageButton type="button" disabled={!canSave} onClick={() => onSave(displayName)}>Guardar {displayName.trim() || "mascote"}</StageButton></div>
    </>
  );
}
