import { StatusMessage } from "@/components/status/StatusMessage";
import { POSE_ROLE_LABELS } from "@/lib/mascot-generation/pose-catalog";
import type { GeneratedPose } from "@/lib/mascot-generation/types";

export function PoseSetReadyStage({ poses }: { poses: GeneratedPose[] }) {
  return (
    <>
      <span className="state-kicker">Três funções, uma identidade</span>
      <h2 id="state-title">Os três jeitos chegaram</h2>
      <StatusMessage
        title="Conjunto criado a partir do Master"
        detail="Compare as três imagens e confirme visualmente que continuam sendo o mesmo personagem."
      />
      <div className="generated-pose-grid" aria-label="Poses geradas do mascote">
        {poses.map((pose) => (
          <figure key={pose.id}>
            {/* O proxy privado já valida ownership e tipo antes de servir a imagem. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pose.imageUrl} alt={`Mascote na função ${POSE_ROLE_LABELS[pose.role]}.`} />
            <figcaption>
              <strong>{POSE_ROLE_LABELS[pose.role]}</strong>
              <span>{pose.label}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
