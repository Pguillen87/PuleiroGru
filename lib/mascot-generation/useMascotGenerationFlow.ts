"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PuleiroState } from "@/lib/puleiro-state";
import { REDUCED_REVEAL_DURATION_MS, REVEAL_DURATION_MS } from "@/lib/puleiro-state";
import { createGenerationJob, pollGenerationJob } from "./client";

export type FlowConfig = { maxUploadBytes: number; pollIntervalMs: number; timeoutMs: number };

export function useMascotGenerationFlow(config: FlowConfig) {
  const [state, setState] = useState<PuleiroState>("entry");
  const [photo, setPhoto] = useState<File>();
  const [photoUrl, setPhotoUrl] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState("Preparando o nascimento…");
  const [errorMessage, setErrorMessage] = useState("");
  const [revealComplete, setRevealComplete] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    setMasterUrl("");
    setState("photo-selection");
  }, []);

  const finishReveal = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    transitionTimer.current = setTimeout(
      () => setRevealComplete(true),
      reduced ? REDUCED_REVEAL_DURATION_MS : REVEAL_DURATION_MS,
    );
  }, []);

  const startGeneration = useCallback(async () => {
    if (!photo) return setState("photo-selection");
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setErrorMessage("");
    setMasterUrl("");
    setRevealComplete(false);
    setState("uploading");
    try {
      const created = await createGenerationJob(photo, current.signal);
      setStatusMessage(created.message);
      setState("creating-job");
      const job = await pollGenerationJob(created.id, {
        intervalMs: config.pollIntervalMs,
        timeoutMs: config.timeoutMs,
        signal: current.signal,
        onProgress: (progress) => {
          setStatusMessage(progress.message);
          setState("preparing");
        },
      });
      if (job.status === "failed") throw new Error(job.message);
      if (!job.masterImageUrl) throw new Error("O resultado chegou sem uma imagem válida.");
      setMasterUrl(job.masterImageUrl);
      setState("master-ready");
      finishReveal();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage(error instanceof Error ? error.message : "Não conseguimos concluir este nascimento.");
      setState("recoverable-error");
    }
  }, [config, finishReveal, photo]);

  return {
    state,
    photo,
    photoUrl,
    masterUrl,
    statusMessage,
    errorMessage,
    revealComplete,
    openSelection: () => setState("photo-selection"),
    selectPhoto,
    changePhoto,
    startGeneration,
    reportMasterImageError: () => {
      setErrorMessage("O mascote foi criado, mas a imagem não pôde ser carregada. Tente novamente.");
      setState("recoverable-error");
    },
    acceptMaster: () => setState("master-approved"),
    rejectMaster: () => setState("master-rejected"),
  };
}
