"use client";

import { useRef, useState, type DragEvent } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/mascot-generation/types";

type PhotoSelectionStageProps = {
  maxUploadBytes: number;
  onSelect: (file: File) => void;
};

export function PhotoSelectionStage({ maxUploadBytes, onSelect }: PhotoSelectionStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const inspect = (file?: File) => {
    setError("");
    if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      setError("Escolha uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > maxUploadBytes) {
      setError(`A foto deve ter até ${Math.floor(maxUploadBytes / 1024 / 1024)} MB.`);
      return;
    }
    onSelect(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    inspect(event.dataTransfer.files[0]);
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
          onChange={(event) => inspect(event.target.files?.[0])}
        />
        <StageButton type="button" onClick={() => inputRef.current?.click()}>Escolher foto</StageButton>
        <span>ou arraste a imagem para este palco</span>
        <small>JPEG, PNG ou WebP · até {Math.floor(maxUploadBytes / 1024 / 1024)} MB</small>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}
