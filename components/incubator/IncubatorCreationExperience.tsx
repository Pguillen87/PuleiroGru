"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccountGate } from "@/components/auth/AccountGate";
import { Header } from "@/components/navigation/Header";
import { StageButton } from "@/components/actions/StageButton";
import { EntryStage } from "@/components/stage/EntryStage";
import { PhotoSelectionStage } from "@/components/stage/PhotoSelectionStage";
import { PhotoPreviewStage } from "@/components/stage/PhotoPreviewStage";
import { SubjectConfirmationStage } from "@/components/stage/SubjectConfirmationStage";
import { PoseSelectionStage } from "@/components/stage/PoseSelectionStage";
import { PuleiroStage } from "@/components/stage/PuleiroStage";
import { PreparingStage } from "@/components/stage/PreparingStage";
import { createIncubation, GenerationRequestError, getGenerationCapabilities, getSubjectHint } from "@/lib/mascot-generation/client";
import { DEFAULT_POSE_CHOICES, POSE_OPTIONS, POSE_ROLE_LABELS } from "@/lib/mascot-generation/pose-catalog";
import type { FlowConfig } from "@/lib/mascot-generation/useMascotGenerationFlow";
import type { PoseChoices, PoseRole, SubjectHint, SubjectIdentity } from "@/lib/mascot-generation/types";

type Step = "entry" | "photo" | "preview" | "subject" | "mismatch" | "normal" | "listening" | "transcribing" | "summary" | "submitting" | "done" | "error";
const nextRole: Record<PoseRole, Step> = { normal: "listening", listening: "transcribing", transcribing: "summary" };

export function IncubatorCreationExperience({ config }: { config: FlowConfig }) {
  return <AccountGate required={config.authenticationRequired}><AuthenticatedIncubatorCreation config={config} /></AccountGate>;
}

function AuthenticatedIncubatorCreation({ config }: { config: FlowConfig }) {
  const [step, setStep] = useState<Step>("entry");
  const [photo, setPhoto] = useState<File>();
  const [photoUrl, setPhotoUrl] = useState("");
  const [identity, setIdentity] = useState<SubjectIdentity>();
  const [hint, setHint] = useState<SubjectHint>();
  const [choices, setChoices] = useState<PoseChoices>(DEFAULT_POSE_CHOICES);
  const [error, setError] = useState("");
  const [canRegisterIncubation, setCanRegisterIncubation] = useState(config.incubatorFlowEnabled);
  const [capabilitiesError, setCapabilitiesError] = useState(false);
  const [subjectHintPending, setSubjectHintPending] = useState(false);
  const [incubationSubmitting, setIncubationSubmitting] = useState(false);
  const subjectHintInFlight = useRef(false);
  const incubationSubmitInFlight = useRef(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  useEffect(() => {
    const controller = new AbortController();
    void getGenerationCapabilities(controller.signal).then((value) => {
      setCapabilitiesError(false);
      setCanRegisterIncubation(config.incubatorFlowEnabled && value.incubator?.enabled === true);
    }).catch(() => {
      setCapabilitiesError(true);
      // Capabilities is a generation preflight. The POST remains the
      // authority for accepting an egg while paid workers are fail-closed.
      setCanRegisterIncubation(config.incubatorFlowEnabled);
    });
    return () => controller.abort();
  }, [config.incubatorFlowEnabled]);

  function selectPhoto(file: File) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setIdempotencyKey(crypto.randomUUID());
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
    setStep("preview");
  }

  async function confirmIdentity(value: SubjectIdentity) {
    if (!photo || subjectHintInFlight.current) return;
    subjectHintInFlight.current = true;
    setSubjectHintPending(true);
    setIdentity(value);
    const controller = new AbortController();
    try {
      const result = await getSubjectHint(photo, value.category, controller.signal);
      setHint(result);
      setStep(result.requiresConfirmation ? "mismatch" : "normal");
    } catch {
      setHint({ version: "subject-hint-v1", suggestedCategory: "uncertain", confidenceBand: "low", requiresConfirmation: false, overrideConfirmed: false });
      setStep("normal");
    } finally {
      subjectHintInFlight.current = false;
      setSubjectHintPending(false);
    }
  }

  async function submit() {
    if (!photo || !identity || !canRegisterIncubation || incubationSubmitInFlight.current) return;
    incubationSubmitInFlight.current = true;
    setIncubationSubmitting(true);
    setError("");
    setStep("submitting");
    const controller = new AbortController();
    try {
      await createIncubation(photo, identity, choices, hint, idempotencyKey, controller.signal);
      setStep("done");
    } catch (cause) {
      setError(cause instanceof GenerationRequestError ? cause.message : "Não foi possível colocar este ovo na Incubadora.");
      setStep("error");
    } finally {
      incubationSubmitInFlight.current = false;
      setIncubationSubmitting(false);
    }
  }

  // The refs are read only by event handlers; stepContent receives those
  // handlers so render never reads mutable ref state.
  // eslint-disable-next-line react-hooks/refs
  const content = stepContent({
    step, photoUrl, identity, hint, choices, canRegisterIncubation, capabilitiesError, subjectHintPending, incubationSubmitting, error,
    maxUploadBytes: config.maxUploadBytes,
    setStep, setChoices, setHint, selectPhoto, confirmIdentity, submit,
  });
  return <div className="site-shell"><Header /><main><div className="experience-layout incubator-entry-layout">
    <PuleiroStage state={mapStage(step)} artwork={photoUrl && ["preview", "subject", "mismatch", "normal", "listening", "transcribing", "summary"].includes(step) ? { src: photoUrl, alt: "Foto escolhida como referência principal do mascote." } : undefined}>
      {content}
    </PuleiroStage>
  </div></main><footer><span>Puleiro do GRU</span><span>Incubadora · nascimento assíncrono</span></footer></div>;
}

function stepContent(input: {
  step: Step; photoUrl: string; identity?: SubjectIdentity; hint?: SubjectHint; choices: PoseChoices; canRegisterIncubation: boolean; capabilitiesError: boolean; subjectHintPending: boolean; incubationSubmitting: boolean; error: string;
  maxUploadBytes: number; setStep: (step: Step) => void; setChoices: React.Dispatch<React.SetStateAction<PoseChoices>>;
  setHint: React.Dispatch<React.SetStateAction<SubjectHint | undefined>>; selectPhoto: (file: File) => void;
  confirmIdentity: (identity: SubjectIdentity) => Promise<void>; submit: () => Promise<void>;
}) {
  if (input.step === "entry") return <EntryStage onStart={() => input.setStep("photo")} />;
  if (input.step === "photo") return <PhotoSelectionStage maxUploadBytes={input.maxUploadBytes} onSelect={input.selectPhoto} />;
  if (input.step === "preview") return <PhotoPreviewStage photoUrl={input.photoUrl} onConfirm={() => input.setStep("subject")} onReplace={() => input.setStep("photo")} onRemove={() => input.setStep("photo")} />;
  if (input.step === "subject") return <SubjectConfirmationStage submitLabel="Confirmar e escolher poses" pending={input.subjectHintPending} onConfirm={(value) => void input.confirmIdentity(value)} onBack={() => input.setStep("preview")} />;
  if (input.step === "mismatch" && input.identity && input.hint) return <MismatchConfirmation identity={input.identity} hint={input.hint} onBack={() => input.setStep("subject")} onContinue={() => { input.setHint((current) => current ? { ...current, overrideConfirmed: true } : current); input.setStep("normal"); }} />;
  if (["normal", "listening", "transcribing"].includes(input.step) && input.identity) {
    const role = input.step as PoseRole;
    return <PoseSelectionStage role={role} category={input.identity.category} selected={input.choices[role]} onSelect={(option) => input.setChoices((current) => ({ ...current, [role]: option }))} onContinue={() => input.setStep(nextRole[role])} onBack={() => input.setStep(role === "normal" ? "subject" : role === "listening" ? "normal" : "listening")} />;
  }
  if (input.step === "summary" && input.identity) return <IncubationSummary photoUrl={input.photoUrl} identity={input.identity} choices={input.choices} canRegister={input.canRegisterIncubation} capabilitiesError={input.capabilitiesError} submitting={input.incubationSubmitting} onBack={() => input.setStep("transcribing")} onSubmit={() => void input.submit()} />;
  if (input.step === "submitting") return <PreparingStage title="Colocando o ovo na Incubadora" message="Registrando foto, tipo e três poses com segurança…" />;
  if (input.step === "done") return <><span className="state-kicker">Ovo registrado</span><h2 id="state-title">A Incubadora cuidará do resto.</h2><p>Você pode fechar esta página. O nascimento continuará no servidor e reaparecerá em Meus mascotes.</p><div className="stage-actions"><a className="stage-button stage-button--primary" href="/meus-mascotes">Abrir Incubadora</a></div></>;
  if (input.step === "error") return <><span className="state-kicker">O ovo continua com você</span><h2 id="state-title">Não conseguimos iniciar.</h2><p className="stage-error" role="alert">{input.error}</p><div className="stage-actions"><StageButton onClick={() => input.setStep("summary")}>Tentar registrar novamente</StageButton></div></>;
  return <PreparingStage title="Preparando…" message="Conferindo o nascimento." />;
}

function MismatchConfirmation({ identity, hint, onBack, onContinue }: { identity: SubjectIdentity; hint: SubjectHint; onBack: () => void; onContinue: () => void }) {
  const suggested = hint.suggestedCategory === "animal" ? "um animal" : "uma pessoa";
  const selected = identity.category === "animal" ? "Animal" : "Pessoa";
  return <><span className="state-kicker">Confirmação importante</span><h2 id="state-title">A foto parece mostrar {suggested}.</h2><p>Você selecionou <strong>{selected}</strong>. Essa escolha muda como o mascote será criado. Deseja continuar assim?</p><div className="stage-actions"><StageButton onClick={onContinue}>Sim, continuar como {selected}</StageButton><StageButton tone="secondary" onClick={onBack}>Corrigir o tipo</StageButton></div></>;
}

function IncubationSummary({ photoUrl, identity, choices, canRegister, capabilitiesError, submitting, onBack, onSubmit }: { photoUrl: string; identity: SubjectIdentity; choices: PoseChoices; canRegister: boolean; capabilitiesError: boolean; submitting: boolean; onBack: () => void; onSubmit: () => void }) {
  const options = useMemo(() => Object.fromEntries(POSE_OPTIONS.map((option) => [option.id, option])), []);
  return <><span className="state-kicker">Tudo decidido antes da geração</span><h2 id="state-title">Revise o ovo antes da Incubadora</h2><div className="incubation-review"><Image unoptimized width={320} height={320} src={photoUrl} alt="Foto principal escolhida." /><dl><div><dt>Tipo</dt><dd>{identity.category === "human" ? "Pessoa" : identity.category === "animal" ? `Animal · ${identity.species}` : identity.label}</dd></div>{(Object.keys(choices) as PoseRole[]).map((role) => <div key={role}><dt>{POSE_ROLE_LABELS[role]}</dt><dd>{options[choices[role]]?.label}</dd></div>)}</dl></div><p className="pose-reference-note">As poses são referências de movimento. O sistema criará o mascote completo em segundo plano, sem pedir decisões no meio.</p><div className="stage-actions"><StageButton disabled={!canRegister || submitting} aria-busy={submitting} onClick={onSubmit}>{submitting ? "Guardando o ovo…" : "Colocar na Incubadora"}</StageButton><StageButton tone="secondary" onClick={onBack} disabled={submitting}>Rever poses</StageButton></div>{!canRegister && <p className="stage-guidance" role="status">A Incubadora não consegue receber novos ovos agora. Tente novamente em instantes.</p>}{canRegister && capabilitiesError && <p className="stage-guidance" role="status">O ovo pode ser guardado; a criação continuará quando a oficina estiver disponível.</p>}</>;
}

function mapStage(step: Step) {
  if (step === "entry") return "entry" as const;
  if (step === "photo") return "photo-selection" as const;
  if (["preview", "subject", "mismatch", "normal", "listening", "transcribing", "summary"].includes(step)) return "photo-preview" as const;
  return "preparing" as const;
}
