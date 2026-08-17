"use client";

import { useState } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { StatusMessage } from "@/components/status/StatusMessage";
import type { MascotLibraryItem } from "@/lib/mascot-generation/types";

export function MascotCodeStage({ item }: { item: MascotLibraryItem }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard?.writeText(item.mascotCode);
    setCopied(true);
  }

  return (
    <>
      <span className="state-kicker">Bilhete de saída do Puleiro</span>
      <h2 id="state-title">Seu GRU está pronto</h2>
      <StatusMessage title="Salvo na sua biblioteca privada" detail="Este código identifica o conjunto na sua conta. A instalação no aplicativo será liberada quando o pacote existir." />
      <div className="mascot-code" aria-label={`Código do seu mascote: ${item.mascotCode}`}>
        <span>Código do mascote</span>
        <strong>{item.mascotCode}</strong>
      </div>
      <div className="stage-actions">
        <StageButton type="button" onClick={() => void copyCode()}>{copied ? "Código copiado" : "Copiar código"}</StageButton>
        <a className="stage-button stage-button--secondary" href="/meus-mascotes">Ver meus mascotes</a>
      </div>
    </>
  );
}
