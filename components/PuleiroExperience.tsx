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
import { PoseSelectionReviewStage, PoseSelectionStage } from "@/components/stage/PoseSelectionStage";
import { SubjectConfirmationStage } from "@/components/stage/SubjectConfirmationStage";
import { PoseSetReadyStage } from "@/components/stage/PoseSetReadyStage";
import { MascotCodeStage } from "@/components/stage/MascotCodeStage";
import { useMascotGenerationFlow, type FlowConfig } from "@/lib/mascot-generation/useMascotGenerationFlow";
import { AccountGate } from "@/components/auth/AccountGate";
import { StageButton } from "@/components/actions/StageButton";

export function PuleiroExperience({ config }: { config: FlowConfig }) {
  return (
    <AccountGate required={config.authenticationRequired}>
      <AuthenticatedPuleiroExperience config={config} />
    </AccountGate>
  );
}

function AuthenticatedPuleiroExperience({ config }: { config: FlowConfig }) {
  const flow = useMascotGenerationFlow(config);
  const [announcement, setAnnouncement] = useState("");

  const stageContent = {
    entry: <EntryStage onStart={flow.openSelection} />,
    "photo-selection": <PhotoSelectionStage maxUploadBytes={config.maxUploadBytes} onSelect={flow.selectPhoto} />,
    "photo-preview": <PhotoPreviewStage onConfirm={flow.confirmPhoto} onReplace={flow.changePhoto} onRemove={flow.changePhoto} />,
    "subject-confirmation": <SubjectConfirmationStage onConfirm={flow.confirmSubject} onBack={flow.changePhoto} />,
    uploading: <PreparingStage title="Enviando sua foto…" message="Atravessando o portão do Puleiro…" />,
    "creating-job": <PreparingStage title="Abrindo o ovo" message="Criando o pedido de nascimento…" />,
    preparing: <PreparingStage message={flow.statusMessage} />,
    "registered-safe": (
      <PreparingStage
        title="Nascimento guardado"
        message={flow.statusMessage}
        detail={config.masterGenerationEnabled
          ? "O pedido está seguro e pronto para iniciar."
          : "O pedido está seguro e não avançará sozinho neste ambiente de validação."}
        guidance={config.masterGenerationEnabled
          ? "Quando estiver pronto, comece o nascimento."
          : "Você pode fechar esta página e voltar com a mesma conta."}
        action={config.masterGenerationEnabled
          ? <StageButton type="button" onClick={flow.startRegisteredGeneration}>Começar nascimento</StageButton>
          : undefined}
      />
    ),
    "master-ready": flow.revealComplete
      ? <MasterDecisionStage mode="ready" position={flow.masterPosition} errorMessage={flow.errorMessage} onAccept={flow.acceptMaster} onNext={flow.nextMaster} />
      : <PreparingStage title="O nascimento começou" message="O palco está revelando seu mascote." />,
    "master-approved": <MasterDecisionStage mode="approved" onAccept={flow.acceptMaster} onNext={flow.nextMaster} />,
    "master-rejected": <MasterDecisionStage mode="ready" position={flow.masterPosition} onAccept={flow.acceptMaster} onNext={flow.nextMaster} />,
    "choosing-normal": <PoseSelectionStage role="normal" category={flow.subjectIdentity?.category ?? "other"} selected={flow.poseChoices.normal} onSelect={(option) => flow.selectPose("normal", option)} onContinue={() => flow.continuePoseSelection("normal")} onBack={() => flow.backPoseSelection("normal")} />,
    "choosing-listening": <PoseSelectionStage role="listening" category={flow.subjectIdentity?.category ?? "other"} selected={flow.poseChoices.listening} onSelect={(option) => flow.selectPose("listening", option)} onContinue={() => flow.continuePoseSelection("listening")} onBack={() => flow.backPoseSelection("listening")} />,
    "choosing-transcribing": <PoseSelectionStage role="transcribing" category={flow.subjectIdentity?.category ?? "other"} selected={flow.poseChoices.transcribing} onSelect={(option) => flow.selectPose("transcribing", option)} onContinue={() => flow.continuePoseSelection("transcribing")} onBack={() => flow.backPoseSelection("transcribing")} />,
    "pose-selection-review": <PoseSelectionReviewStage choices={flow.poseChoices} enabled={config.poseGenerationEnabled} errorMessage={flow.errorMessage} onGenerate={flow.generatePoseSet} onBack={() => flow.backPoseSelection("review")} />,
    "generating-poses": <PreparingStage title="Experimentando os três jeitos" message={flow.statusMessage} detail="O mascote mestre continua sendo a referência de identidade." />,
    "pose-set-ready": flow.poses.length === 3
      ? <PoseSetReadyStage poses={flow.poses} errorMessage={flow.errorMessage} onRetrySave={flow.errorMessage ? flow.retryLibrarySave : undefined} />
      : <PreparingStage title="Conferindo os três jeitos" message={flow.statusMessage} detail="As imagens estão sendo validadas antes de aparecerem no palco." />,
    "saving-library": <PreparingStage title="Guardando seu mascote" message="Preparando o bilhete de saída do Puleiro…" detail="O conjunto ficará salvo na sua biblioteca privada." />,
    "code-ready": flow.libraryItem ? <MascotCodeStage item={flow.libraryItem} onCreateAnother={flow.startNewMascot} /> : <PreparingStage title="Guardando seu mascote" message="Preparando o código do seu mascote…" />,
    "recoverable-error": <ErrorStage message={flow.errorMessage} canRetry={!isPhotoValidationError(flow.errorCode)} onRetry={flow.startGeneration} onChange={flow.changePhoto} />,
  }[flow.state];

  const artwork = flow.state === "photo-preview" && flow.photoUrl
    ? { src: flow.photoUrl, alt: "Prévia da fotografia do pet escolhida para criar o mascote." }
    : flow.masterUrl && ["master-ready", "master-approved", "master-rejected", "choosing-normal", "choosing-listening", "choosing-transcribing", "pose-selection-review", "generating-poses", "pose-set-ready", "saving-library", "code-ready"].includes(flow.state)
      ? { src: flow.masterUrl, alt: "Mascote mestre criado a partir da fotografia enviada." }
      : undefined;

  return (
    <div className="site-shell">
      <Header onUnavailableNavigation={(destination) => setAnnouncement(`${destination} estará disponível em uma próxima etapa.`)} />
      <main>
        <h1 id="puleiro-main-title" className="sr-only" tabIndex={-1}>Puleiro do GRU</h1>
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

function isPhotoValidationError(code: string) {
  return ["INVALID_TYPE", "FILE_TOO_LARGE", "IMAGE_TOO_SMALL", "IMAGE_FORMAT_MISMATCH", "IMAGE_DECODE_FAILED"].includes(code);
}
