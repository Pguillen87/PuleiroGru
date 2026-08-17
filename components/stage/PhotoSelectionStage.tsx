"use client";

import { useRef, useState, type DragEvent } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { preparePhotoForUpload } from "@/lib/mascot-generation/photo-preparation";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/mascot-generation/types";

type PhotoSelectionStageProps = {
  maxUploadBytes: number;
  onSelect: (file: File) => void;
};

export function PhotoSelectionStage({ maxUploadBytes, onSelect }: PhotoSelectionStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const inspect = async (file?: File) => {
    if (isPreparing) return;
    setError("");
    if (!file) return setError("Escolha uma imagem JPEG, PNG ou WebP.");
    setIsPreparing(true);
    try {
      onSelect(await preparePhotoForUpload(file, maxUploadBytes));
    } catch (preparationError) {
      setError(preparationError instanceof Error ? preparationError.message : "Não foi possível preparar esta foto.");
    } finally {
      setIsPreparing(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isPreparing) return;
    void inspect(event.dataTransfer.files[0]);
  };

  return (
    <>
      <span className="state-kicker">Escolha a fotografia</span>
      <h2 id="state-title">Quem vai nascer no Puleiro?</h2>
      <p className="stage-guidance">Use uma foto nítida, com o personagem principal visível e boa iluminação.</p>
      <div
        className={`photo-dropzone${isDragging ? " photo-dropzone--active" : ""}`}
        aria-busy={isPreparing}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id="pet-photo"
          aria-label="Fotografia do personagem"
          className="sr-only"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void inspect(file);
          }}
        />
        <StageButton type="button" disabled={isPreparing} onClick={() => inputRef.current?.click()}>
          {isPreparing ? "Preparando foto…" : "Escolher foto"}
        </StageButton>
        <span>ou arraste a imagem para este palco</span>
        <small>JPEG, PNG ou WebP · tamanho ajustado automaticamente</small>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}
