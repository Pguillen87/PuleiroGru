"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Header } from "@/components/navigation/Header";
import { StageButton } from "@/components/actions/StageButton";
import { finalizeMascot, GenerationRequestError, getIncubation, hatchIncubation, selectIncubatorMaster } from "@/lib/mascot-generation/client";
import type { GenerationJob } from "@/lib/mascot-generation/types";
import { POSE_ROLE_LABELS } from "@/lib/mascot-generation/pose-catalog";

export function IncubationJournal({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<GenerationJob>();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedMasterId, setSelectedMasterId] = useState<string>();
  const selectionSubmitting = useRef(false);
  const orderedPoses = useMemo(() => job?.poses.toSorted((left, right) => {
    const order = { normal: 0, listening: 1, transcribing: 2 } as const;
    return order[left.role] - order[right.role];
  }) ?? [], [job?.poses]);

  useEffect(() => {
    const controller = new AbortController();
    void getIncubation(jobId, controller.signal)
      .then(setJob)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível abrir o Jornal.");
      });
    return () => controller.abort();
  }, [jobId]);

  async function hatch() {
    setBusy(true); setError("");
    const controller = new AbortController();
    try { setJob(await hatchIncubation(jobId, controller.signal)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível chocar este ovo."); }
    finally { setBusy(false); }
  }

  async function complete(event: FormEvent) {
    event.preventDefault();
    if (!job || displayName.trim().length < 2) return;
    setBusy(true); setError("");
    const controller = new AbortController();
    try {
      await finalizeMascot(job.id, displayName.trim(), controller.signal);
      router.push("/meus-mascotes");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof GenerationRequestError ? cause.message : "Não foi possível concluir este nascimento.");
    } finally { setBusy(false); }
  }

  async function confirmMasterSelection() {
    if (!selectedMasterId || selectionSubmitting.current) return;
    selectionSubmitting.current = true;
    setBusy(true); setError("");
    const controller = new AbortController();
    try { setJob(await selectIncubatorMaster(jobId, selectedMasterId, controller.signal)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível guardar esta escolha."); }
    finally { selectionSubmitting.current = false; setBusy(false); }
  }

  return <div className="site-shell"><Header /><main className="journal-page">
    <section className="journal-reveal" aria-labelledby="journal-title">
      <div className="journal-reveal__heading"><span className="state-kicker">{job?.productState === "NEEDS_HUMAN_MASTER_SELECTION" ? "Precisa de você" : "Jornal do nascimento"}</span><h1 id="journal-title">{job?.productState === "NEEDS_HUMAN_MASTER_SELECTION" ? "Escolha o mascote que mais parece com o seu." : job?.productState === "HATCHED" ? "Seu mascote saiu do ovo." : "O ovo está pronto para chocar."}</h1><p>{job?.productState === "NEEDS_HUMAN_MASTER_SELECTION" ? "Encontramos mais de uma opção boa. Sua escolha continuará o mesmo nascimento." : job?.productState === "HATCHED" ? "Escolha o nome que seguirá com ele para a Biblioteca e para o GRU." : "As três poses passaram pelas conferências. Chocar não inicia uma nova geração."}</p></div>
      {job?.productState === "NEEDS_HUMAN_MASTER_SELECTION" && <div className="incubator-master-selection"><div className="incubator-master-selector" role="group" aria-label="Escolha um mascote mestre">{job.masters.map((master) => <button type="button" aria-pressed={selectedMasterId === master.id} key={master.id} disabled={busy} data-selected={selectedMasterId === master.id || undefined} onClick={() => { setSelectedMasterId(master.id); setError(""); }}><Image unoptimized width={320} height={320} src={master.imageUrl} alt={`Opção de mascote ${master.id.replace("master_", "")}.`} /><span>Selecionar esta opção</span></button>)}</div><div className="journal-reveal__action"><StageButton disabled={busy || !selectedMasterId} onClick={() => void confirmMasterSelection()}>{busy ? "Guardando escolha…" : "Confirmar escolha"}</StageButton></div></div>}
      {orderedPoses.length === 3 && <div className="journal-pose-showcase">
        {orderedPoses.map((pose, index) => <figure className={index === 0 ? "journal-pose-showcase__hero" : undefined} key={pose.id}><Image unoptimized width={720} height={720} src={pose.imageUrl} alt={`${POSE_ROLE_LABELS[pose.role]} do mascote gerado.`} /><figcaption>{POSE_ROLE_LABELS[pose.role]}</figcaption></figure>)}
      </div>}
      {!job && !error && <p role="status">Abrindo o Jornal…</p>}
      {error && <p className="stage-error" role="alert">{error}</p>}
      {job?.productState === "READY_TO_HATCH" && <div className="journal-reveal__action"><StageButton disabled={busy} onClick={() => void hatch()}>{busy ? "Chocando…" : "Chocar ovo"}</StageButton></div>}
      {job?.productState === "HATCHED" && <form className="journal-name-form" onSubmit={complete}><label htmlFor="incubator-display-name">Nome do mascote</label><input id="incubator-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={32} autoComplete="off" required /><p>De 2 a 32 caracteres. O pacote Android só ficará pronto depois desta confirmação.</p><StageButton type="submit" disabled={busy || displayName.trim().length < 2}>{busy ? "Guardando…" : "Concluir nascimento"}</StageButton></form>}
    </section>
  </main></div>;
}
