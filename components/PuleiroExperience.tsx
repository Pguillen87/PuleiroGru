"use client";

import { useState } from "react";
import { Header } from "@/components/navigation/Header";
import { EditorialNote, ProgressFolio } from "@/components/editorial/EditorialDetails";
import { EntryStage } from "@/components/stage/EntryStage";
import { ErrorStage } from "@/components/stage/ErrorStage";
import { MasterDecisionStage } from "@/components/stage/MasterDecisionStage";
import { PhotoPreviewStage } from "@/components/stage/PhotoPreviewStage";
import { PhotoSelectionStage } from "@/components/stage/PhotoSelectionStage";
import { PreparingStage } from "@/components/stage/PreparingStage";
import { PuleiroStage } from "@/components/stage/PuleiroStage";
import { useMascotGenerationFlow, type FlowConfig } from "@/lib/mascot-generation/useMascotGenerationFlow";

export function PuleiroExperience({ config }: { config: FlowConfig }) {
  const flow = useMascotGenerationFlow(config);
  const [announcement, setAnnouncement] = useState("");

  const stageContent = {
    entry: <EntryStage onStart={flow.openSelection} />,
    "photo-selection": <PhotoSelectionStage maxUploadBytes={config.maxUploadBytes} onSelect={flow.selectPhoto} />,
    "photo-preview": <PhotoPreviewStage onConfirm={flow.startGeneration} onReplace={flow.changePhoto} onRemove={flow.changePhoto} />,
    uploading: <PreparingStage title="Enviando sua foto…" message="Atravessando o portão do Puleiro…" />,
    "creating-job": <PreparingStage title="Abrindo o ovo" message="Criando o pedido de nascimento…" />,
    preparing: <PreparingStage message={flow.statusMessage} />,
    "registered-safe": <PreparingStage title="Nascimento registrado com segurança" message={flow.statusMessage} />,
    "master-ready": flow.revealComplete
      ? <MasterDecisionStage mode="ready" position={flow.masterPosition} onAccept={flow.acceptMaster} onNext={flow.nextMaster} />
      : <PreparingStage title="O nascimento começou" message="O palco está revelando seu mascote." />,
    "master-approved": <MasterDecisionStage mode="approved" onAccept={flow.acceptMaster} onNext={flow.nextMaster} />,
    "master-rejected": <MasterDecisionStage mode="ready" position={flow.masterPosition} onAccept={flow.acceptMaster} onNext={flow.nextMaster} />,
    "recoverable-error": <ErrorStage message={flow.errorMessage} onRetry={flow.startGeneration} onChange={flow.changePhoto} />,
  }[flow.state];

  const artwork = flow.state === "photo-preview" && flow.photoUrl
    ? { src: flow.photoUrl, alt: "Prévia da fotografia do pet escolhida para criar o mascote." }
    : flow.masterUrl && ["master-ready", "master-approved", "master-rejected"].includes(flow.state)
      ? { src: flow.masterUrl, alt: "Mascote mestre criado a partir da fotografia enviada." }
      : undefined;

  return (
    <div className="site-shell">
      <Header onUnavailableNavigation={(destination) => setAnnouncement(`${destination} estará disponível em uma próxima etapa.`)} />
      <main>
        <h1 className="sr-only">Puleiro do GRU</h1>
        <div className="experience-layout">
          <ProgressFolio state={flow.state} />
          <PuleiroStage
            state={flow.state}
            artwork={artwork}
            revealing={flow.state === "master-ready" && !flow.revealComplete}
            onArtworkError={flow.masterUrl ? flow.reportMasterImageError : undefined}
          >
            {stageContent}
          </PuleiroStage>
          <EditorialNote state={flow.state} />
        </div>
        <p
          className={announcement ? "system-feedback" : "sr-only"}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </p>
      </main>
      <footer>
        <span>Puleiro do GRU</span>
        <span>Fonte visual oficial · Stitch</span>
      </footer>
    </div>
  );
}
