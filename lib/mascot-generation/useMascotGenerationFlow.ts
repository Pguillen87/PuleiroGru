"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PuleiroState } from "@/lib/puleiro-state";
import { REDUCED_REVEAL_DURATION_MS, REVEAL_DURATION_MS } from "@/lib/puleiro-state";
import { approveMaster, createGenerationJob, pollGenerationJob, resumeGenerationJob, startMasterGeneration } from "./client";
import type { GenerationJob } from "./types";

export type FlowConfig = {
  maxUploadBytes: number;
  pollIntervalMs: number;
  timeoutMs: number;
  technicalRegistrationOnly: boolean;
  masterGenerationEnabled: boolean;
  authenticationRequired: boolean;
};

export function useMascotGenerationFlow(config: FlowConfig) {
  const [state, setState] = useState<PuleiroState>("entry");
  const [photo, setPhoto] = useState<File>();
  const [photoUrl, setPhotoUrl] = useState("");
  const [job, setJob] = useState<GenerationJob>();
  const [masterIndex, setMasterIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Preparando o nascimento…");
  const [errorMessage, setErrorMessage] = useState("");
  const [revealComplete, setRevealComplete] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeMaster = job?.masters[masterIndex];

  useEffect(() => {
    const current = new AbortController();
    void resumeGenerationJob(current.signal).then((resumed) => {
      if (!resumed) return;
      setJob(resumed);
      setStatusMessage(resumed.message);
      if (resumed.status === "registered" || resumed.status === "awaiting_generation_authorization") setState("registered-safe");
      else if (resumed.status === "awaiting_master_approval") {
        setRevealComplete(true);
        setState("master-ready");
      } else if (resumed.status === "master_approved") setState("master-approved");
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

  const selectPhoto = useCallback((file: File) => {
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
    setErrorMessage("");
    setState("photo-preview");
  }, []);

  const changePhoto = useCallback(() => {
    controller.current?.abort();
    setPhoto(undefined);
    setPhotoUrl("");
    setJob(undefined);
    setMasterIndex(0);
    setState("photo-selection");
  }, []);

  const finishReveal = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    transitionTimer.current = setTimeout(() => setRevealComplete(true), reduced ? REDUCED_REVEAL_DURATION_MS : REVEAL_DURATION_MS);
  }, []);

  const applyJob = useCallback((result: GenerationJob) => {
    setJob(result);
    setStatusMessage(result.message);
    if (result.status === "registered" || result.status === "awaiting_generation_authorization") return setState("registered-safe");
    if (result.status === "failed" || result.status === "canceled") throw new Error(result.message);
    if (result.status !== "awaiting_master_approval" || result.masters.length === 0) throw new Error("O resultado chegou sem opções válidas.");
    setMasterIndex(0);
    setState("master-ready");
    finishReveal();
  }, [finishReveal]);

  const startGeneration = useCallback(async () => {
    if (!photo) return setState("photo-selection");
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setJob(undefined);
    setRevealComplete(false);
    setState("uploading");
    try {
      const created = await createGenerationJob(photo, current.signal);
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
  }, [applyJob, config, photo]);

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
    try {
      const approved = await approveMaster(job.id, activeMaster.id, current.signal);
      setJob(approved);
      setState("master-approved");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível registrar sua escolha.");
      setState("recoverable-error");
    }
  }, [activeMaster, job]);

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
    changePhoto,
    startGeneration,
    startRegisteredGeneration,
    reportMasterImageError: () => {
      setErrorMessage("O mascote foi criado, mas a imagem não pôde ser carregada.");
      setState("recoverable-error");
    },
    acceptMaster,
    nextMaster,
  }), [acceptMaster, activeMaster, changePhoto, errorMessage, job, masterIndex, nextMaster, photoUrl, revealComplete, selectPhoto, startGeneration, state, statusMessage]);
}
