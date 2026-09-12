"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/navigation/Header";
import type { IncubationProductState, IncubationSummary } from "@/lib/mascot-generation/types";

type IncubatorFilter = "all" | "in-progress" | "ready" | "naming" | "failed";

const FILTERS: Array<{ id: IncubatorFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "in-progress", label: "Em andamento" },
  { id: "ready", label: "Prontos para abrir" },
  { id: "naming", label: "Concluir nome" },
  { id: "failed", label: "Falhas" },
];

export function filterIncubations(items: IncubationSummary[], filter: IncubatorFilter) {
  if (filter === "all") return items;
  return items.filter((item) => matchesFilter(item.productState, filter));
}

export function incubationListLabel(item: IncubationSummary) {
  if (item.productState === "READY_TO_HATCH") return "Pronto para abrir";
  if (item.productState === "HATCHED") return "Concluir nome";
  if (item.productState === "FAILED") return "Nascimento interrompido";
  if (item.productState === "NEEDS_HUMAN_MASTER_SELECTION") return "Exceção operacional";
  if (item.phase === "generating_poses" || item.phase === "validating_poses") return "Preparando as poses…";
  if (item.phase === "generating_masters" || item.phase === "validating_masters") return "Criando seu mascote…";
  return "Preparando…";
}

export function IncubatorList() {
  const [items, setItems] = useState<IncubationSummary[]>([]);
  const [filter, setFilter] = useState<IncubatorFilter>("all");
  const [message, setMessage] = useState("Abrindo sua Incubadora…");

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/mascot/incubations", { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => ({})) as { incubations?: IncubationSummary[]; message?: string };
        if (!response.ok) throw new Error(body.message ?? "Não foi possível abrir a Incubadora.");
        const next = body.incubations ?? [];
        setItems(next);
        setMessage(next.length ? "Cada etapa vem do trabalho confirmado no servidor." : "Sua Incubadora está vazia. Novos mascotes aparecerão aqui depois da criação.");
        if (next.some((item) => item.productState === "PREPARING" || item.productState === "INCUBATING")) {
          timer = window.setTimeout(() => void load(), 8_000);
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Não foi possível abrir a Incubadora.");
      }
    };
    void load();
    return () => { controller.abort(); if (timer) window.clearTimeout(timer); };
  }, []);

  const visible = useMemo(() => filterIncubations(items, filter), [filter, items]);

  return <div className="site-shell">
    <Header />
    <main className="library-page" aria-labelledby="incubator-list-title">
      <section className="library-intro">
        <div><span className="state-kicker">Área privada</span><h1 id="incubator-list-title">Incubadora</h1><p>Acompanhe seus nascimentos. Você pode sair e voltar; o processamento continua no servidor.</p></div>
        <p className="library-count" aria-live="polite">{items.length} {items.length === 1 ? "nascimento" : "nascimentos"}</p>
      </section>
      <div className="library-controls" aria-label="Filtrar Incubadora">
        <div className="library-filters" role="group" aria-label="Estados da Incubadora">
          {FILTERS.map((option) => <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>)}
        </div>
      </div>
      <p className="library-status" role="status" aria-live="polite">{message}</p>
      {visible.length > 0 ? <ul className="incubator-grid" aria-label="Nascimentos na Incubadora">
        {visible.map((item) => <IncubatorCard item={item} key={item.attemptId} />)}
      </ul> : <section className="library-empty" aria-labelledby="incubator-empty-title"><h2 id="incubator-empty-title">Nenhum nascimento neste filtro</h2><p>Quando você confirmar uma nova criação, ela ficará nesta área até o nome ser guardado.</p><Link className="stage-button stage-button--primary" href="/criar">Criar meu mascote</Link></section>}
    </main>
  </div>;
}

function IncubatorCard({ item }: { item: IncubationSummary }) {
  const action = actionFor(item.productState);
  const title = `Nascimento ${item.attemptId.slice(-6).toUpperCase()}`;
  const href = item.jobId ? `/incubadora/${encodeURIComponent(item.jobId)}` : undefined;
  return <li><article className="incubator-egg" data-state={item.productState}>
    <div className="incubator-egg__illustration" aria-hidden="true"><span className="incubator-egg__shell" /><span className="incubator-egg__nest" /></div>
    <div className="incubator-egg__body"><p>{incubationListLabel(item)}</p><h2>{title}</h2><time dateTime={item.updatedAt}>Atualizado {formatRelativeUpdate(item.updatedAt)}</time>
      {item.productState === "FAILED" && <p className="incubator-egg__error">Abra os detalhes para entender a falha antes de qualquer recuperação.</p>}
      {href ? <Link className="incubator-egg__action" href={href}>{action}</Link> : <p className="incubator-egg__pending" role="status">Confirmando a criação no servidor…</p>}
    </div>
  </article></li>;
}

function matchesFilter(state: IncubationProductState, filter: IncubatorFilter) {
  if (filter === "ready") return state === "READY_TO_HATCH";
  if (filter === "naming") return state === "HATCHED";
  if (filter === "failed") return state === "FAILED";
  return state === "PREPARING" || state === "INCUBATING" || state === "NEEDS_HUMAN_MASTER_SELECTION";
}

function actionFor(state: IncubationProductState) {
  if (state === "READY_TO_HATCH") return "Abrir mascote";
  if (state === "HATCHED") return "Concluir nome";
  if (state === "NEEDS_HUMAN_MASTER_SELECTION") return "Revisar exceção";
  if (state === "FAILED") return "Ver detalhes";
  return "Acompanhar";
}

function formatRelativeUpdate(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}
