"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PuleiroState } from "@/lib/puleiro-state";
import { REDUCED_REVEAL_DURATION_MS, REVEAL_DURATION_MS } from "@/lib/puleiro-state";
import { approveMaster, createGenerationJob, deleteGenerationJob, finalizeMascot, GenerationRequestError, getGenerationCapabilities, pollGenerationJob, resumeGenerationJob, startMasterGeneration, startPoseGeneration, updateMascotConfiguration } from "./client";
import { DEFAULT_POSE_CHOICES, POSE_CATALOG_VERSION, POSE_OPTIONS, POSE_ROLE_ORDER } from "./pose-catalog";
import type { GenerationCapabilities, GenerationJob, MascotLibraryItem, PoseChoices, PoseRole, SubjectIdentity } from "./types";
import type { GenerationProgressModel } from "@/components/status/GenerationProgress";

export type FlowConfig = {
  maxUploadBytes: number;
  pollIntervalMs: number;
  timeoutMs: number;
  technicalRegistrationOnly: boolean;
  masterGenerationEnabled: boolean;
  poseGenerationEnabled: boolean;
  authenticationRequired: boolean;
};

export function useMascotGenerationFlow(config: FlowConfig) {
  const [state, setState] = useState<PuleiroState>("entry");
  const [photo, setPhoto] = useState<File>();
  const [photoUrl, setPhotoUrl] = useState("");
  const [job, setJob] = useState<GenerationJob>();
  const [subjectIdentity, setSubjectIdentity] = useState<SubjectIdentity>();
  const [poseChoices, setPoseChoices] = useState<PoseChoices>(DEFAULT_POSE_CHOICES);
  const [masterIndex, setMasterIndex] = useState(0);
  const [masterImageVersion, setMasterImageVersion] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Preparando o nascimento…");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [revealComplete, setRevealComplete] = useState(false);
  const [libraryItem, setLibraryItem] = useState<MascotLibraryItem>();
  const [generationStartedAt, setGenerationStartedAt] = useState<number>();
  const [capabilities, setCapabilities] = useState<GenerationCapabilities>();
  const [configurationSaving, setConfigurationSaving] = useState(false);
  const [configurationSavingField, setConfigurationSavingField] = useState<"displayName" | PoseRole>();
  const [configurationSaveStatus, setConfigurationSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [masterApprovalPending, setMasterApprovalPending] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const resumeController = useRef<AbortController | undefined>(undefined);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const poseOperationInFlight = useRef(false);
  const newAttemptForPhoto = useRef(false);
  const librarySaveInFlight = useRef(false);
  const libraryAutoSaveAttempted = useRef(false);
  const masterApprovalInFlight = useRef(false);
  const activeMaster = job?.masters[masterIndex];
  const progress = generationProgress(state, job, generationStartedAt);
  const capabilitiesLoading = Boolean(job && ["awaiting_master_approval", "master_approved"].includes(job.status) && !capabilities);
  const configurationReady = Boolean(
    job?.status === "master_approved"
    && job.approvedMasterId
    && validDisplayName(job.configuration.displayName)
    && (Object.keys(poseChoices) as PoseRole[]).every((role) =>
      POSE_OPTIONS.some((option) => option.role === role && option.id === poseChoices[role]),
    ),
  );
  const poseGenerationReady = Boolean(
    configurationReady
    && capabilities?.poses.ready
    && capabilities.poses.catalogVersion === POSE_CATALOG_VERSION
    && (Object.keys(poseChoices) as PoseRole[]).every((role) => capabilities.poseCatalog[role]?.includes(poseChoices[role])),
  );

  useEffect(() => {
    const jobStatus = job?.status;
    if (!jobStatus || !["awaiting_master_approval", "master_approved"].includes(jobStatus)) return;
    const current = new AbortController();
    void getGenerationCapabilities(current.signal)
      .then(setCapabilities)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível conferir a oficina de poses.");
      });
    return () => current.abort();
  }, [job?.id, job?.status]);

  const finishLibrary = useCallback(async (completedJob: GenerationJob, displayName: string) => {
    if (librarySaveInFlight.current) return;
    librarySaveInFlight.current = true;
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setErrorCode("");
    setState("saving-library");
    try {
      const saved = await finalizeMascot(completedJob.id, displayName, current.signal);
      setLibraryItem(saved);
      setState("code-ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível guardar este mascote agora.");
      setState("pose-set-ready");
    } finally {
      librarySaveInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const current = new AbortController();
    resumeController.current = current;
    void resumeGenerationJob(current.signal).then((resumed) => {
      if (current.signal.aborted || !resumed) return;
      setJob(resumed);
      setSubjectIdentity(resumed.subjectIdentity);
      setPoseChoices(resumed.poseChoices);
      setStatusMessage(resumed.message);
      if (resumed.status === "registered" || resumed.status === "awaiting_generation_authorization") setState("registered-safe");
      else if (resumed.status === "awaiting_master_approval") {
        setRevealComplete(true);
        setState("master-ready");
      } else if (resumed.status === "master_approved") setState("configuring-poses");
      else if (resumed.status === "generating_poses") setState("generating-poses");
      else if (resumed.status === "awaiting_set_approval") setState("pose-set-ready");
      else if (resumed.status === "failed" || resumed.status === "canceled") setState("recoverable-error");
      else setState("preparing");
    }).catch(() => undefined);
    return () => current.abort();
  }, []);

  useEffect(() => () => {
    controller.current?.abort();
    resumeController.current?.abort();
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const saveLibrary = useCallback((displayName: string) => {
    if (!job || libraryItem) return;
    libraryAutoSaveAttempted.current = true;
    void finishLibrary(job, displayName);
  }, [finishLibrary, job, libraryItem]);

  const selectPhoto = useCallback((file: File) => {
    stopResume(resumeController);
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
    setErrorMessage("");
    setErrorCode("");
    setLibraryItem(undefined);
    setCapabilities(undefined);
    newAttemptForPhoto.current = true;
    libraryAutoSaveAttempted.current = false;
    setState("photo-preview");
  }, []);

  const changePhoto = useCallback(() => {
    controller.current?.abort();
    stopResume(resumeController);
    setPhoto(undefined);
    setPhotoUrl("");
    setJob(undefined);
    setMasterIndex(0);
    setMasterImageVersion(0);
    setSubjectIdentity(undefined);
    setPoseChoices(DEFAULT_POSE_CHOICES);
    setLibraryItem(undefined);
    setCapabilities(undefined);
    newAttemptForPhoto.current = true;
    libraryAutoSaveAttempted.current = false;
    setState("photo-selection");
  }, []);

  const startNewMascot = useCallback(() => {
    controller.current?.abort();
    stopResume(resumeController);
    setPhoto(undefined);
    setPhotoUrl("");
    setJob(undefined);
    setSubjectIdentity(undefined);
    setMasterIndex(0);
    setMasterImageVersion(0);
    setPoseChoices(DEFAULT_POSE_CHOICES);
    setLibraryItem(undefined);
    setErrorMessage("");
    setErrorCode("");
    setRevealComplete(false);
    newAttemptForPhoto.current = true;
    libraryAutoSaveAttempted.current = false;
    setState("photo-selection");
  }, []);

  const confirmPhoto = useCallback(() => setState("subject-confirmation"), []);

  const finishReveal = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    transitionTimer.current = setTimeout(() => setRevealComplete(true), reduced ? REDUCED_REVEAL_DURATION_MS : REVEAL_DURATION_MS);
  }, []);

  const applyJob = useCallback((result: GenerationJob) => {
    setJob(result);
    setStatusMessage(result.message);
    if (result.status === "registered" || result.status === "awaiting_generation_authorization") return setState("registered-safe");
    if (result.status === "failed" || result.status === "canceled") {
      throw new GenerationRequestError(
        result.message,
        result.retryable ?? result.errorCode === "WORKER_LOST",
        result.errorCode ?? "GENERATION_FAILED",
      );
    }
    if (result.status === "master_approved") return setState("configuring-poses");
    if (result.status === "awaiting_set_approval") return setState("pose-set-ready");
    if (result.status !== "awaiting_master_approval") throw new Error("O nascimento retornou em um estado inesperado.");
    if (result.masters.length === 0) throw new Error("O nascimento terminou, mas as opções ainda não estão disponíveis.");
    setMasterIndex(0);
    setMasterImageVersion(0);
    setState("master-ready");
    finishReveal();
  }, [finishReveal]);

  const deleteRegisteredMascot = useCallback(async () => {
    if (!job || !["registered", "awaiting_generation_authorization"].includes(job.status)) return false;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    try {
      await deleteGenerationJob(job.id, current.signal);
      startNewMascot();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      if (error instanceof GenerationRequestError && error.retryable) {
        try {
          const resumed = await resumeGenerationJob(current.signal);
          if (!resumed || resumed.id !== job.id) {
            if (resumed) applyJob(resumed);
            else startNewMascot();
            return true;
          }
        } catch (resumeError) {
          if (resumeError instanceof DOMException && resumeError.name === "AbortError") return false;
        }
      }
      setErrorCode(error instanceof GenerationRequestError ? error.code : "JOB_DELETE_FAILED");
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível excluir este nascimento agora.");
      return false;
    }
  }, [applyJob, job, startNewMascot]);

  const startGeneration = useCallback(async (confirmedIdentity?: SubjectIdentity) => {
    if (!photo) return setState("photo-selection");
    const identity = confirmedIdentity ?? subjectIdentity;
    if (!identity) return setState("subject-confirmation");
    setSubjectIdentity(identity);
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setErrorCode("");
    setJob(undefined);
    setRevealComplete(false);
    setGenerationStartedAt(Date.now());
    setState("uploading");
    try {
      // Once a registration request leaves the browser, its server-issued
      // attempt cookie is the idempotency boundary. A retry must reuse it.
      const startNewAttempt = newAttemptForPhoto.current;
      newAttemptForPhoto.current = false;
      const created = await createGenerationJob(photo, identity, current.signal, startNewAttempt);
      setJob(created);
      setState("creating-job");
      const scheduled = config.masterGenerationEnabled
        && (created.status === "registered" || created.status === "awaiting_generation_authorization")
        ? await startMasterGeneration(created.id, current.signal)
        : created;
      setJob(scheduled);
      const result = await pollGenerationJob(scheduled, {
        intervalMs: config.pollIntervalMs,
        timeoutMs: config.timeoutMs,
        signal: current.signal,
        onProgress: (progress) => {
          setJob(progress);
          setStatusMessage(progress.message);
          setState("preparing");
        },
      });
      applyJob(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const code = error instanceof GenerationRequestError ? error.code : "CREATE_JOB_FAILED";
      setErrorCode(code);
      setErrorMessage(error instanceof Error ? error.message : "Não conseguimos concluir este nascimento.");
      setState("recoverable-error");
    }
  }, [applyJob, config, photo, subjectIdentity]);

  const startRegisteredGeneration = useCallback(async () => {
    if (!job) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setErrorCode("");
    setRevealComplete(false);
    setGenerationStartedAt(Date.now());
    setState("preparing");
    try {
      const scheduled = await startMasterGeneration(job.id, current.signal);
      setJob(scheduled);
      const result = await pollGenerationJob(scheduled, {
        intervalMs: config.pollIntervalMs,
        timeoutMs: config.timeoutMs,
        signal: current.signal,
        onProgress: (progress) => {
          setJob(progress);
          setStatusMessage(progress.message);
          setState("preparing");
        },
      });
      applyJob(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorCode(error instanceof GenerationRequestError ? error.code : "CREATE_JOB_FAILED");
      setErrorMessage(error instanceof Error ? error.message : "Não conseguimos concluir este nascimento.");
      setState("recoverable-error");
    }
  }, [applyJob, config, job]);

  const resumeCurrentGeneration = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setErrorCode("");
    setState("creating-job");
    try {
      const resumed = await resumeGenerationJob(current.signal);
      if (!resumed) {
        // A request can have reserved an attempt but lost the upstream reply.
        // Reuse the existing attempt and image in memory; Modal receives the
        // same idempotency key, so this cannot create a second birth.
        if (photo && subjectIdentity) {
          await startGeneration(subjectIdentity);
          return;
        }
        throw new GenerationRequestError("O registro ainda está sendo confirmado. Aguarde um instante e retome novamente.", true, "REGISTRATION_CONFIRMATION_PENDING");
      }
      newAttemptForPhoto.current = false;
      if (resumed.status === "failed" && resumed.errorCode === "WORKER_LOST") {
        const restarted = await startMasterGeneration(resumed.id, current.signal);
        setJob(restarted);
        setStatusMessage(restarted.message);
        setState("preparing");
        const completed = await pollGenerationJob(restarted, {
          intervalMs: config.pollIntervalMs,
          timeoutMs: config.timeoutMs,
          signal: current.signal,
          onProgress: (progress) => {
            setJob(progress);
            setStatusMessage(progress.message);
          },
        });
        applyJob(completed);
        return;
      }
      if (["queued", "generating_masters", "generating_poses"].includes(resumed.status)) {
        setJob(resumed);
        setStatusMessage(resumed.message);
        setState(resumed.status === "generating_poses" ? "generating-poses" : "preparing");
        const completed = await pollGenerationJob(resumed, {
          intervalMs: config.pollIntervalMs,
          timeoutMs: config.timeoutMs,
          signal: current.signal,
          onProgress: (progress) => {
            setJob(progress);
            setStatusMessage(progress.message);
          },
        });
        applyJob(completed);
      } else {
        applyJob(resumed);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorCode(error instanceof GenerationRequestError ? error.code : "REGISTRATION_CONFIRMATION_PENDING");
      setErrorMessage(error instanceof Error ? error.message : "O registro ainda está sendo confirmado.");
      setState("recoverable-error");
    }
  }, [applyJob, config, photo, startGeneration, subjectIdentity]);

  const acceptMaster = useCallback(async () => {
    if (!job || !activeMaster || masterApprovalInFlight.current) return;
    masterApprovalInFlight.current = true;
    setMasterApprovalPending(true);
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    try {
      const approved = await approveMaster(job.id, activeMaster.id, current.signal);
      setJob((existing) => ({ ...approved, masters: approved.masters.length ? approved.masters : existing?.masters ?? [] }));
      setSubjectIdentity(approved.subjectIdentity);
      setPoseChoices(approved.configuration.poseChoices);
      setState("configuring-poses");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível registrar sua escolha.");
      setState("master-ready");
    } finally {
      masterApprovalInFlight.current = false;
      setMasterApprovalPending(false);
    }
  }, [activeMaster, job]);

  const saveConfiguration = useCallback(async (next: { displayName?: string; poseChoices?: PoseChoices }, field: "displayName" | PoseRole) => {
    if (!job || configurationSaving) return false;
    const previous = job;
    const optimistic = {
      ...job,
      configuration: {
        ...job.configuration,
        ...next,
        poseChoices: next.poseChoices ?? job.configuration.poseChoices,
      },
      poseChoices: next.poseChoices ?? job.poseChoices,
    };
    const current = new AbortController();
    controller.current = current;
    setConfigurationSaving(true);
    setConfigurationSavingField(field);
    setConfigurationSaveStatus("saving");
    setErrorMessage("");
    setJob(optimistic);
    setPoseChoices(optimistic.configuration.poseChoices);
    try {
      const updated = await updateMascotConfiguration(job.id, {
        ...next,
        configurationRevision: job.configuration.configurationRevision,
      }, current.signal);
      setJob((existing) => ({ ...updated, masters: updated.masters.length ? updated.masters : existing?.masters ?? previous.masters }));
      setPoseChoices(updated.configuration.poseChoices);
      setConfigurationSaveStatus("saved");
      return true;
    } catch (error) {
      const conflict = error instanceof GenerationRequestError && error.code === "POSE_CONFIGURATION_CONFLICT";
      if (conflict) {
        try {
          const refreshed = await resumeGenerationJob(current.signal);
          if (refreshed) {
            setJob((existing) => ({ ...refreshed, masters: refreshed.masters.length ? refreshed.masters : existing?.masters ?? previous.masters }));
            setPoseChoices(refreshed.configuration.poseChoices);
          } else {
            setJob(previous);
            setPoseChoices(previous.configuration.poseChoices);
          }
        } catch {
          setJob(previous);
          setPoseChoices(previous.configuration.poseChoices);
        }
      } else {
        setJob(previous);
        setPoseChoices(previous.configuration.poseChoices);
      }
      setConfigurationSaveStatus("error");
      setErrorMessage(conflict
        ? "A configuração foi alterada em outra sessão. As escolhas mais recentes foram recarregadas."
        : error instanceof Error ? error.message : "Não foi possível salvar a configuração.");
      return false;
    } finally {
      setConfigurationSaving(false);
      setConfigurationSavingField(undefined);
    }
  }, [configurationSaving, job]);

  const saveDisplayName = useCallback((displayName: string) => saveConfiguration({ displayName }, "displayName"), [saveConfiguration]);
  const savePoseChoice = useCallback((role: PoseRole, optionId: string) => {
    if (!job) return Promise.resolve(false);
    return saveConfiguration({ poseChoices: { ...job.configuration.poseChoices, [role]: optionId } }, role);
  }, [job, saveConfiguration]);
  const openPoseConfiguration = useCallback(() => setState("configuring-poses"), []);
  const closePoseConfiguration = useCallback(() => setState("master-approved"), []);

  const selectPose = useCallback((role: PoseRole, optionId: string) => {
    setPoseChoices((current) => ({ ...current, [role]: optionId }));
  }, []);

  const continuePoseSelection = useCallback((role: PoseRole) => {
    setErrorMessage("");
    const index = POSE_ROLE_ORDER.indexOf(role);
    const next = POSE_ROLE_ORDER[index + 1];
    setState(next ? `choosing-${next}` as PuleiroState : "pose-selection-review");
  }, []);

  const backPoseSelection = useCallback((role: PoseRole | "review") => {
    setErrorMessage("");
    if (role === "review") return setState("choosing-transcribing");
    const index = POSE_ROLE_ORDER.indexOf(role);
    const previous = POSE_ROLE_ORDER[index - 1];
    setState(previous ? `choosing-${previous}` as PuleiroState : "master-ready");
  }, []);

  const generatePoseSet = useCallback(async () => {
    if (!job || !poseGenerationReady || poseOperationInFlight.current) return;
    poseOperationInFlight.current = true;
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setGenerationStartedAt(Date.now());
    setState("generating-poses");
    let operationAccepted = false;
    try {
      const scheduled = await startPoseGeneration(job.id, poseChoices, current.signal);
      operationAccepted = true;
      setJob(scheduled);
      const result = await pollGenerationJob(scheduled, {
        intervalMs: config.pollIntervalMs,
        timeoutMs: config.timeoutMs,
        signal: current.signal,
        onProgress: (progress) => {
          setJob(progress);
          setStatusMessage(progress.message);
        },
      });
      setJob(result);
      setStatusMessage(result.message);
      setState(result.status === "awaiting_set_approval" ? "pose-set-ready" : "generating-poses");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Não foi possível consultar as poses agora.";
      if (operationAccepted) {
        setStatusMessage(`${message} A operação continua guardada e será retomada sem novo pedido.`);
        setState("generating-poses");
      } else {
        setErrorMessage(message);
        setState("configuring-poses");
      }
    } finally {
      poseOperationInFlight.current = false;
    }
  }, [config, job, poseChoices, poseGenerationReady]);

  const nextMaster = useCallback(() => {
    if (!job?.masters.length) return;
    setErrorMessage("");
    setMasterImageVersion(0);
    setMasterIndex((current) => (current + 1) % job.masters.length);
  }, [job]);

  const retryMasterImage = useCallback(() => {
    setErrorMessage("");
    setMasterImageVersion((current) => current + 1);
  }, []);

  const masterUrl = !activeMaster?.imageUrl
    ? ""
    : masterImageVersion === 0
      ? activeMaster.imageUrl
      : `${activeMaster.imageUrl}${activeMaster.imageUrl.includes("?") ? "&" : "?"}preview=${masterImageVersion}`;

  return useMemo(() => ({
    state,
    photoUrl,
    masterUrl,
    masterPosition: activeMaster ? `${masterIndex + 1} de ${job?.masters.length ?? 1}` : "",
    statusMessage,
    progress,
    errorMessage,
    errorCode,
    revealComplete,
    openSelection: startNewMascot,
    selectPhoto,
    confirmPhoto,
    confirmSubject: startGeneration,
    changePhoto,
    startNewMascot,
    deleteRegisteredMascot,
    startGeneration,
    resumeCurrentGeneration,
    startRegisteredGeneration,
    reportMasterImageError: () => {
      setErrorMessage("O mascote foi criado, mas a prévia não carregou. Seu nascimento continua salvo; recarregue a imagem.");
      setRevealComplete(true);
      setState("master-ready");
    },
    retryMasterImage,
    acceptMaster,
    nextMaster,
    subjectIdentity,
    poseChoices,
    configuration: job?.configuration,
    configurationSaving,
    configurationSavingField,
    configurationSaveStatus,
    configurationReady,
    masterApprovalPending,
    poseGenerationReady,
    poseCapabilitiesLoading: capabilitiesLoading,
    poseCapabilityMessage: capabilityMessage(capabilities, capabilitiesLoading),
    poses: job?.poses ?? [],
    libraryItem,
    saveLibrary,
    selectPose,
    saveDisplayName,
    savePoseChoice,
    openPoseConfiguration,
    closePoseConfiguration,
    continuePoseSelection,
    backPoseSelection,
    generatePoseSet,
  }), [acceptMaster, activeMaster, backPoseSelection, capabilities, capabilitiesLoading, changePhoto, closePoseConfiguration, configurationReady, configurationSaveStatus, configurationSaving, configurationSavingField, confirmPhoto, continuePoseSelection, deleteRegisteredMascot, errorCode, errorMessage, generatePoseSet, job, libraryItem, masterApprovalPending, masterIndex, masterUrl, nextMaster, openPoseConfiguration, photoUrl, poseChoices, poseGenerationReady, progress, resumeCurrentGeneration, revealComplete, retryMasterImage, saveDisplayName, saveLibrary, savePoseChoice, selectPhoto, selectPose, startGeneration, startNewMascot, startRegisteredGeneration, state, statusMessage, subjectIdentity]);
}

function validDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length >= 2 && normalized.length <= 32 && /^[\p{L}\p{N} .'-]+$/u.test(normalized);
}

function capabilityMessage(capabilities: GenerationCapabilities | undefined, loading: boolean) {
  if (loading) return "Conferindo a oficina de poses…";
  if (capabilities?.poses.ready) return "A oficina está pronta para gerar exatamente as três escolhas.";
  const messages: Record<string, string> = {
    POSE_GENERATION_DISABLED: "A oficina de poses está bloqueada operacionalmente neste ambiente.",
    GPU_GENERATION_DISABLED: "A GPU da oficina está desligada neste ambiente.",
    POSE_TEMPLATES_UNAVAILABLE: "Os moldes de pose ainda não estão instalados na oficina.",
  };
  return messages[capabilities?.poses.reasons?.[0] ?? ""] ?? "A oficina de poses ainda não está pronta. Suas escolhas continuam salvas.";
}

function generationProgress(state: PuleiroState, job?: GenerationJob, startedAt?: number): GenerationProgressModel | undefined {
  if (state === "uploading") return { kind: "birth", phase: "received", label: "Foto recebida", startedAt };
  if (state === "creating-job") return { kind: "birth", phase: "registered", label: "Nascimento registrado", startedAt };
  if (state === "preparing") {
    const workerStarted = job?.status === "generating_masters";
    return {
      kind: "birth",
      phase: workerStarted ? "working" : "registered",
      label: workerStarted ? "Criando três opções" : "Nascimento registrado", startedAt,
    };
  }
  if (state === "generating-poses") {
    return {
      kind: "poses",
      phase: job?.poses?.length === 3 ? "confirmed" : "working",
      label: job?.poses?.length === 3 ? "Três poses verificadas" : "Preparando as três poses", startedAt,
    };
  }
  return undefined;
}

function stopResume(controller: React.MutableRefObject<AbortController | undefined>) {
  controller.current?.abort();
  controller.current = undefined;
}
