"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/navigation/Header";
import type { IncubationProductState, IncubationSummary } from "@/lib/mascot-generation/types";
import { formatIncubationDate, type IncubationTiming } from "@/lib/mascot-generation/incubation-progress";
import { IncubationProgress } from "./IncubationProgress";
import { useIncubations } from "./useIncubations";

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
  const { items, error, loaded, reload } = useIncubations();
  const [filter, setFilter] = useState<IncubatorFilter>("all");
  const [timing, setTiming] = useState<IncubationTiming>({ averageMs: null, sampleCount: 0 });
  const [now, setNow] = useState(0);
  const [highlight, setHighlight] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/mascot/incubations/timing", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (response.ok) setTiming(await response.json()); }).catch(() => undefined);
    const tick = () => { setNow(Date.now()); setHighlight(new URLSearchParams(window.location.search).get("created") ?? ""); };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 15_000);
    return () => { controller.abort(); window.clearTimeout(first); window.clearInterval(timer); };
  }, []);

  const visible = useMemo(() => filterIncubations(items, filter), [filter, items]);

  return <div className="site-shell">
    <Header />
    <main className="library-page" aria-labelledby="incubator-list-title">
      <section className="library-intro">
        <div><h1 id="incubator-list-title">Incubadora</h1><p>Seu mascote está a caminho. Você pode sair e voltar para acompanhar por aqui.</p><Link href="/criar">Criar outro mascote</Link></div>
        <p className="library-count" aria-live="polite">{items.length} {items.length === 1 ? "nascimento" : "nascimentos"}</p>
      </section>
      <div className="library-controls" aria-label="Filtrar Incubadora">
        <div className="library-filters" role="group" aria-label="Estados da Incubadora">
          {FILTERS.map((option) => <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>)}
        </div>
      </div>
      {highlight && <p role="status">Criação recebida. Seu novo nascimento está destacado abaixo.</p>}
      {error ? <div role="alert"><p>{error} {loaded && "Mostrando a última consulta confirmada."}</p><button className="stage-button" onClick={reload}>Tentar novamente</button></div>
        : <p className="library-status" role="status">{loaded ? "Abra o mascote quando estiver pronto. Ele fica aqui até você dar o nome e guardar." : "Abrindo sua Incubadora…"}</p>}
      {visible.length > 0 ? <ul className="incubator-grid" aria-label="Nascimentos na Incubadora">
        {visible.map((item) => <IncubatorCard item={item} key={item.attemptId} timing={timing} now={now} highlighted={highlight === item.attemptId} />)}
      </ul> : loaded && !error && <section className="library-empty" aria-labelledby="incubator-empty-title"><h2 id="incubator-empty-title">Nenhum nascimento neste filtro</h2><p>Quando você confirmar uma nova criação, ela ficará nesta área até o nome ser guardado.</p><Link className="stage-button stage-button--primary" href="/criar">Criar meu mascote</Link></section>}
    </main>
  </div>;
}

function IncubatorCard({ item, timing, now, highlighted }: { item: IncubationSummary; timing: IncubationTiming; now: number; highlighted: boolean }) {
  const action = actionFor(item.productState);
  const title = `Nascimento ${item.attemptId.slice(-6).toUpperCase()}`;
  const href = item.jobId ? `/incubadora/${encodeURIComponent(item.jobId)}` : undefined;
  return <li><article className="incubator-egg" data-state={item.productState} data-new={highlighted}>
    <div className="incubator-egg__illustration" aria-hidden="true"><span className="incubator-egg__shell" /><span className="incubator-egg__nest" /></div>
    <div className="incubator-egg__body"><p>{incubationListLabel(item)}</p><h2>{title}</h2>
      <p className="incubator-egg__date">Pedido em <time dateTime={item.createdAt}>{formatIncubationDate(item.createdAt)}</time></p>
      <p className="incubator-egg__date">Última atualização: <time dateTime={item.updatedAt}>{formatIncubationDate(item.updatedAt)}</time></p>
      <IncubationProgress item={item} timing={timing} now={now} />
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
