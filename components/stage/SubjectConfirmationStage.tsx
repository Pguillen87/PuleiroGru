"use client";

import { useState, type FormEvent } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";
import type { SubjectCategory, SubjectIdentity } from "@/lib/mascot-generation/types";

const CATEGORIES: Array<{ value: SubjectCategory; label: string; detail: string }> = [
  { value: "human", label: "Pessoa", detail: "Permanece humana, sem traços animais." },
  { value: "animal", label: "Animal", detail: "Preserva a espécie informada." },
  { value: "object", label: "Objeto", detail: "Mantém materiais e partes reconhecíveis." },
  { value: "other", label: "Outro", detail: "Você descreve o sujeito principal." },
];

export function SubjectConfirmationStage({
  onConfirm,
  onBack,
}: {
  onConfirm: (identity: SubjectIdentity) => void;
  onBack: () => void;
}) {
  const [category, setCategory] = useState<SubjectCategory>();
  const [description, setDescription] = useState("");
  const needsDescription = category === "animal" || category === "object" || category === "other";
  const normalized = description.replace(/\s+/g, " ").trim();
  const ready = Boolean(category && (!needsDescription || normalized.length >= 2));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category || !ready) return;
    const label = category === "human" ? "pessoa" : normalized;
    onConfirm({
      category,
      label,
      species: category === "animal" ? normalized : undefined,
      confirmed: true,
    });
  }

  return (
    <>
      <span className="state-kicker">Identidade antes do nascimento</span>
      <h2 id="state-title">O que deve virar mascote?</h2>
      <StatusMessage
        title="Confirme o sujeito principal"
        detail="Essa escolha impede que pessoa, animal e objeto sejam misturados durante a geração."
      />
      <form className="subject-form" onSubmit={submit}>
        <fieldset className="choice-grid">
          <legend className="sr-only">Tipo do sujeito principal</legend>
          {CATEGORIES.map((item) => (
            <label className="choice-option" key={item.value}>
              <input
                type="radio"
                name="subject-category"
                value={item.value}
                checked={category === item.value}
                onChange={() => setCategory(item.value)}
              />
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </label>
          ))}
        </fieldset>
        {needsDescription && (
          <label className="subject-description">
            <span>{category === "animal" ? "Qual é a espécie?" : "Como podemos identificar?"}</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={64}
              autoComplete="off"
              placeholder={category === "animal" ? "Ex.: cachorro, gato, arara" : "Ex.: bicicleta vermelha"}
              required
            />
          </label>
        )}
        <div className="stage-actions">
          <StageButton type="submit" disabled={!ready}>Confirmar e começar</StageButton>
          <StageButton type="button" tone="secondary" onClick={onBack}>Voltar à foto</StageButton>
        </div>
      </form>
    </>
  );
}
