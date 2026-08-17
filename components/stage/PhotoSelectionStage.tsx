"use client";

import { useRef, useState, type DragEvent } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { ACCEPTED_IMAGE_TYPES, MIN_IMAGE_DIMENSION } from "@/lib/mascot-generation/types";

type PhotoSelectionStageProps = {
  maxUploadBytes: number;
  onSelect: (file: File) => void;
};

export function PhotoSelectionStage({ maxUploadBytes, onSelect }: PhotoSelectionStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const inspect = async (file?: File) => {
    setError("");
    if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      setError("Escolha uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > maxUploadBytes) {
      setError(`A foto deve ter até ${Math.floor(maxUploadBytes / 1024 / 1024)} MB.`);
      return;
    }
    const dimensions = await readImageDimensions(file);
    if (!dimensions) {
      setError("Não foi possível abrir esta imagem. Escolha uma foto JPEG, PNG ou WebP válida.");
      return;
    }
    if (dimensions.width < MIN_IMAGE_DIMENSION || dimensions.height < MIN_IMAGE_DIMENSION) {
      setError(`Esta foto é pequena para criar um mascote. Escolha uma imagem com pelo menos ${MIN_IMAGE_DIMENSION} × ${MIN_IMAGE_DIMENSION} pixels.`);
      return;
    }
    onSelect(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void inspect(event.dataTransfer.files[0]);
  };

  return (
    <>
      <span className="state-kicker">Escolha a fotografia</span>
      <h2 id="state-title">Quem vai nascer no Puleiro?</h2>
      <p className="stage-guidance">Use uma foto nítida, com o pet visível e boa iluminação.</p>
      <div
        className={`photo-dropzone${isDragging ? " photo-dropzone--active" : ""}`}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id="pet-photo"
          aria-label="Fotografia do pet"
          className="sr-only"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void inspect(file);
          }}
        />
        <StageButton type="button" onClick={() => inputRef.current?.click()}>Escolher foto</StageButton>
        <span>ou arraste a imagem para este palco</span>
        <small>JPEG, PNG ou WebP · até {Math.floor(maxUploadBytes / 1024 / 1024)} MB</small>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}

async function readImageDimensions(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const dimensions = await new Promise<{ width: number; height: number } | undefined>((resolve) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve(undefined);
      image.src = url;
    });
    return dimensions;
  } finally {
    URL.revokeObjectURL(url);
  }
}
