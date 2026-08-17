"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PuleiroState } from "@/lib/puleiro-state";
import { REDUCED_REVEAL_DURATION_MS, REVEAL_DURATION_MS } from "@/lib/puleiro-state";
import { approveMaster, createGenerationJob, finalizeMascot, pollGenerationJob, resumeGenerationJob, startMasterGeneration, startPoseGeneration } from "./client";
import { DEFAULT_POSE_CHOICES, POSE_ROLE_ORDER } from "./pose-catalog";
import type { GenerationJob, MascotLibraryItem, PoseChoices, PoseRole, SubjectIdentity } from "./types";

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
  const [statusMessage, setStatusMessage] = useState("Preparando o nascimento…");
  const [errorMessage, setErrorMessage] = useState("");
  const [revealComplete, setRevealComplete] = useState(false);
  const [libraryItem, setLibraryItem] = useState<MascotLibraryItem>();
  const controller = useRef<AbortController | undefined>(undefined);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const poseOperationInFlight = useRef(false);
  const newAttemptForPhoto = useRef(false);
  const librarySaveInFlight = useRef(false);
  const libraryAutoSaveAttempted = useRef(false);
  const activeMaster = job?.masters[masterIndex];

  const finishLibrary = useCallback(async (completedJob: GenerationJob) => {
    if (librarySaveInFlight.current) return;
    librarySaveInFlight.current = true;
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setState("saving-library");
    try {
      const saved = await finalizeMascot(completedJob.id, current.signal);
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
    void resumeGenerationJob(current.signal).then((resumed) => {
      if (!resumed) return;
      setJob(resumed);
      setSubjectIdentity(resumed.subjectIdentity);
      setPoseChoices(resumed.poseChoices);
      setStatusMessage(resumed.message);
      if (resumed.status === "registered" || resumed.status === "awaiting_generation_authorization") setState("registered-safe");
      else if (resumed.status === "awaiting_master_approval") {
        setRevealComplete(true);
        setState("master-ready");
      } else if (resumed.status === "master_approved") setState("choosing-normal");
      else if (resumed.status === "generating_poses") setState("generating-poses");
      else if (resumed.status === "awaiting_set_approval") setState("pose-set-ready");
      else if (resumed.status === "failed" || resumed.status === "canceled") setState("recoverable-error");
      else setState("preparing");
    }).catch(() => undefined);
    return () => current.abort();
  }, []);

  useEffect(() => () => {
    controller.current?.abort();
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  useEffect(() => {
    if (state !== "pose-set-ready" || !job || libraryItem || librarySaveInFlight.current || libraryAutoSaveAttempted.current) return;
    libraryAutoSaveAttempted.current = true;
    void finishLibrary(job);
  }, [finishLibrary, job, libraryItem, state]);

  const selectPhoto = useCallback((file: File) => {
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
    setErrorMessage("");
    setLibraryItem(undefined);
    newAttemptForPhoto.current = true;
    libraryAutoSaveAttempted.current = false;
    setState("photo-preview");
  }, []);

  const changePhoto = useCallback(() => {
    controller.current?.abort();
    setPhoto(undefined);
    setPhotoUrl("");
    setJob(undefined);
    setMasterIndex(0);
    setSubjectIdentity(undefined);
    setPoseChoices(DEFAULT_POSE_CHOICES);
    setLibraryItem(undefined);
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
    if (result.status === "failed" || result.status === "canceled") throw new Error(result.message);
    if (result.status === "master_approved") return setState("choosing-normal");
    if (result.status === "awaiting_set_approval") return setState("pose-set-ready");
    if (result.status !== "awaiting_master_approval") throw new Error("O nascimento retornou em um estado inesperado.");
    if (result.masters.length === 0) throw new Error("O nascimento terminou, mas as opções ainda não estão disponíveis.");
    setMasterIndex(0);
    setState("master-ready");
    finishReveal();
  }, [finishReveal]);

  const startGeneration = useCallback(async (confirmedIdentity?: SubjectIdentity) => {
    if (!photo) return setState("photo-selection");
    const identity = confirmedIdentity ?? subjectIdentity;
    if (!identity) return setState("subject-confirmation");
    setSubjectIdentity(identity);
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setJob(undefined);
    setRevealComplete(false);
    setState("uploading");
    try {
      const created = await createGenerationJob(photo, identity, current.signal, newAttemptForPhoto.current);
      newAttemptForPhoto.current = false;
      setState("creating-job");
      const scheduled = config.masterGenerationEnabled
        && (created.status === "registered" || created.status === "awaiting_generation_authorization")
        ? await startMasterGeneration(created.id, current.signal)
        : created;
      const result = await pollGenerationJob(scheduled, {
        intervalMs: config.pollIntervalMs,
        timeoutMs: config.timeoutMs,
        signal: current.signal,
        onProgress: (progress) => {
          setStatusMessage(progress.message);
          setState("preparing");
        },
      });
      applyJob(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
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
    setRevealComplete(false);
    setState("preparing");
    try {
      const scheduled = await startMasterGeneration(job.id, current.signal);
      const result = await pollGenerationJob(scheduled, {
        intervalMs: config.pollIntervalMs,
        timeoutMs: config.timeoutMs,
        signal: current.signal,
        onProgress: (progress) => {
          setStatusMessage(progress.message);
          setState("preparing");
        },
      });
      applyJob(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage(error instanceof Error ? error.message : "Não conseguimos concluir este nascimento.");
      setState("recoverable-error");
    }
  }, [applyJob, config, job]);

  const acceptMaster = useCallback(async () => {
    if (!job || !activeMaster) return;
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    try {
      const approved = await approveMaster(job.id, activeMaster.id, current.signal);
      setJob((existing) => ({ ...approved, masters: approved.masters.length ? approved.masters : existing?.masters ?? [] }));
      setSubjectIdentity(approved.subjectIdentity);
      setPoseChoices(approved.poseChoices);
      setState("choosing-normal");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível registrar sua escolha.");
      setState("master-ready");
    }
  }, [activeMaster, job]);

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
    if (!job || !config.poseGenerationEnabled || poseOperationInFlight.current) return;
    poseOperationInFlight.current = true;
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
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
        onProgress: (progress) => setStatusMessage(progress.message),
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
        setState("pose-selection-review");
      }
    } finally {
      poseOperationInFlight.current = false;
    }
  }, [config, job, poseChoices]);

  const nextMaster = useCallback(() => {
    if (!job?.masters.length) return;
    setMasterIndex((current) => (current + 1) % job.masters.length);
  }, [job]);

  return useMemo(() => ({
    state,
    photoUrl,
    masterUrl: activeMaster?.imageUrl ?? "",
    masterPosition: activeMaster ? `${masterIndex + 1} de ${job?.masters.length ?? 1}` : "",
    statusMessage,
    errorMessage,
    revealComplete,
    openSelection: () => setState("photo-selection"),
    selectPhoto,
    confirmPhoto,
    confirmSubject: startGeneration,
    changePhoto,
    startGeneration,
    startRegisteredGeneration,
    reportMasterImageError: () => {
      setErrorMessage("O mascote foi criado, mas a imagem não pôde ser carregada.");
      setState("recoverable-error");
    },
    acceptMaster,
    nextMaster,
    subjectIdentity,
    poseChoices,
    poses: job?.poses ?? [],
    libraryItem,
    retryLibrarySave: () => {
      if (!job) return;
      libraryAutoSaveAttempted.current = true;
      void finishLibrary(job);
    },
    selectPose,
    continuePoseSelection,
    backPoseSelection,
    generatePoseSet,
  }), [acceptMaster, activeMaster, backPoseSelection, changePhoto, confirmPhoto, continuePoseSelection, errorMessage, finishLibrary, generatePoseSet, job, libraryItem, masterIndex, nextMaster, photoUrl, poseChoices, revealComplete, selectPhoto, selectPose, startGeneration, startRegisteredGeneration, state, statusMessage, subjectIdentity]);
}
