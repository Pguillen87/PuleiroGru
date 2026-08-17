import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";

type PhotoPreviewStageProps = {
  photoUrl: string;
  onConfirm: () => void;
  onReplace: () => void;
  onRemove: () => void;
};

export function PhotoPreviewStage({ photoUrl, onConfirm, onReplace, onRemove }: PhotoPreviewStageProps) {
  return (
    <>
      <span className="state-kicker">Foto no palco</span>
      <h2 id="state-title">Esta é a foto certa?</h2>
      <StatusMessage title="Nada foi enviado ainda" detail="Confira a foto selecionada antes de começar o nascimento." />
      <figure className="photo-preview-card">
        {/* A prévia local só é usada nesta confirmação e não foi enviada ao servidor. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="Prévia local da fotografia escolhida para criar o mascote." />
        <figcaption>Prévia local · ainda não enviada</figcaption>
      </figure>
      <div className="stage-actions" aria-label="Ações da foto">
        <StageButton onClick={onConfirm}>Usar esta foto</StageButton>
        <StageButton tone="secondary" onClick={onReplace}>Trocar foto</StageButton>
        <StageButton tone="secondary" className="stage-button--quiet" onClick={onRemove}>Remover foto</StageButton>
      </div>
    </>
  );
}
