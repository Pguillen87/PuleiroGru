"use client";

import { useState } from "react";
import { Header } from "@/components/navigation/Header";
import { EditorialNote, ProgressFolio } from "@/components/editorial/EditorialDetails";
import { EntryStage } from "@/components/stage/EntryStage";
import { ErrorStage, type ErrorStageMode } from "@/components/stage/ErrorStage";
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
import { MascotConfigurationDialog } from "@/components/stage/MascotConfigurationDialog";

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
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  const stageContent = {
    entry: <EntryStage onStart={flow.openSelection} />,
    "photo-selection": <PhotoSelectionStage maxUploadBytes={config.maxUploadBytes} onSelect={flow.selectPhoto} />,
    "photo-preview": flow.photoUrl ? (
      <PhotoPreviewStage
        photoUrl={flow.photoUrl}
        onConfirm={flow.confirmPhoto}
        onReplace={flow.changePhoto}
        onRemove={flow.changePhoto}
      />
    ) : <PhotoSelectionStage maxUploadBytes={config.maxUploadBytes} onSelect={flow.selectPhoto} />,
    "subject-confirmation": <SubjectConfirmationStage onConfirm={flow.confirmSubject} onBack={flow.changePhoto} />,
    uploading: <PreparingStage title="Enviando sua foto…" message="Atravessando o portão do Puleiro…" progress={flow.progress} />,
    "creating-job": <PreparingStage title="Abrindo o ovo" message="Criando o pedido de nascimento…" progress={flow.progress} />,
    preparing: <PreparingStage message={flow.statusMessage} progress={flow.progress} />,
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
          : deleteConfirmationOpen ? <>
              <p role="alert">A foto enviada e este nascimento serão excluídos definitivamente.</p>
              <StageButton type="button" tone="secondary" onClick={() => setDeleteConfirmationOpen(false)}>Cancelar</StageButton>
              <StageButton type="button" onClick={() => {
                setDeleteConfirmationOpen(false);
                void flow.deleteRegisteredMascot();
              }}>Confirmar exclusão</StageButton>
            </>
            : <StageButton type="button" tone="secondary" onClick={() => setDeleteConfirmationOpen(true)}>Excluir este nascimento</StageButton>}
      />
    ),
    "master-ready": flow.revealComplete
      ? <MasterDecisionStage mode="ready" position={flow.masterPosition} errorMessage={flow.errorMessage} approving={flow.masterApprovalPending} onAccept={flow.acceptMaster} onNext={flow.nextMaster} onReloadImage={flow.retryMasterImage} />
      : <PreparingStage title="O nascimento começou" message="O palco está revelando seu mascote." />,
    "master-approved": <MasterDecisionStage mode="approved" onAccept={flow.openPoseConfiguration} onNext={flow.nextMaster} />,
    "master-rejected": <MasterDecisionStage mode="ready" position={flow.masterPosition} onAccept={flow.acceptMaster} onNext={flow.nextMaster} />,
    "configuring-poses": flow.configuration ? <MascotConfigurationDialog
      category={flow.subjectIdentity?.category ?? "other"}
      configuration={flow.configuration}
      masterUrl={flow.masterUrl}
      saving={flow.configurationSaving}
      savingField={flow.configurationSavingField}
      saveStatus={flow.configurationSaveStatus}
      configurationReady={flow.configurationReady}
      poseGenerationReady={flow.poseGenerationReady}
      capabilityMessage={flow.poseCapabilityMessage}
      errorMessage={flow.errorMessage}
      onSaveName={flow.saveDisplayName}
      onSavePose={flow.savePoseChoice}
      onGenerate={flow.generatePoseSet}
      onDismiss={flow.closePoseConfiguration}
    /> : <PreparingStage title="Abrindo o Jornal do Puleiro" message="Recuperando as escolhas salvas…" />,
    "choosing-normal": <PoseSelectionStage role="normal" category={flow.subjectIdentity?.category ?? "other"} selected={flow.poseChoices.normal} onSelect={(option) => flow.selectPose("normal", option)} onContinue={() => flow.continuePoseSelection("normal")} onBack={() => flow.backPoseSelection("normal")} />,
    "choosing-listening": <PoseSelectionStage role="listening" category={flow.subjectIdentity?.category ?? "other"} selected={flow.poseChoices.listening} onSelect={(option) => flow.selectPose("listening", option)} onContinue={() => flow.continuePoseSelection("listening")} onBack={() => flow.backPoseSelection("listening")} />,
    "choosing-transcribing": <PoseSelectionStage role="transcribing" category={flow.subjectIdentity?.category ?? "other"} selected={flow.poseChoices.transcribing} onSelect={(option) => flow.selectPose("transcribing", option)} onContinue={() => flow.continuePoseSelection("transcribing")} onBack={() => flow.backPoseSelection("transcribing")} />,
    "pose-selection-review": <PoseSelectionReviewStage choices={flow.poseChoices} enabled={flow.poseGenerationReady} capabilityMessage={flow.poseCapabilityMessage} errorMessage={flow.errorMessage} onGenerate={flow.generatePoseSet} onBack={() => flow.backPoseSelection("review")} />,
    "generating-poses": <PreparingStage title="Experimentando os três jeitos" message={flow.statusMessage} detail="O mascote mestre continua sendo a referência de identidade." progress={flow.progress} />,
    "pose-set-ready": flow.poses.length === 3
      ? <PoseSetReadyStage poses={flow.poses} errorMessage={flow.errorMessage} onSave={flow.saveLibrary} />
      : <PreparingStage title="Conferindo os três jeitos" message={flow.statusMessage} detail="As imagens estão sendo validadas antes de aparecerem no palco." />,
    "saving-library": <PreparingStage title="Guardando seu mascote" message="Preparando o bilhete de saída do Puleiro…" detail="O conjunto ficará salvo na sua biblioteca privada." />,
    "code-ready": flow.libraryItem ? <MascotCodeStage item={flow.libraryItem} onCreateAnother={flow.startNewMascot} /> : <PreparingStage title="Guardando seu mascote" message="Preparando o código do seu mascote…" />,
    "recoverable-error": (
      <ErrorStage
        message={flow.errorMessage}
        mode={errorMode(flow.errorCode)}
        onResume={flow.resumeCurrentGeneration}
        onChange={flow.changePhoto}
        onBack={flow.openSelection}
      />
    ),
  }[flow.state];

  const artwork = flow.masterUrl && ["master-ready", "master-approved", "master-rejected", "configuring-poses", "choosing-normal", "choosing-listening", "choosing-transcribing", "pose-selection-review", "generating-poses", "pose-set-ready", "saving-library", "code-ready"].includes(flow.state)
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
            onArtworkError={flow.state === "master-ready" && flow.masterUrl ? flow.reportMasterImageError : undefined}
            progress={flow.progress}
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
  return ["INVALID_TYPE", "FILE_TOO_LARGE", "IMAGE_FORMAT_MISMATCH", "IMAGE_DECODE_FAILED"].includes(code);
}

function errorMode(code: string): ErrorStageMode {
  if (code === "REGISTRATION_DISABLED") return "service-unavailable";
  if (["REGISTRATION_CONFIRMATION_PENDING", "GENERATION_STILL_RUNNING", "WORKER_LOST"].includes(code)) return "resume-only";
  if (isPhotoValidationError(code)) return "photo-only";
  return "recoverable";
}
