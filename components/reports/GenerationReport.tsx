"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/navigation/Header";
import type { GenerationMetric } from "@/lib/mascot-generation/types";

type Summary = { totalRuns: number; completedRuns: number; masterTypicalMs?: number; poseTypicalMs?: number; estimatedCostUsd: number; actualCostUsd: number; hasActualCost: boolean };

export function GenerationReport() {
  const [metrics, setMetrics] = useState<GenerationMetric[]>([]);
  const [summary, setSummary] = useState<Summary>();
  const [message, setMessage] = useState("Abrindo o caderno de criação…");

  useEffect(() => {
    void fetch("/api/mascot/reports", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { metrics?: GenerationMetric[]; summary?: Summary; message?: string };
      if (!response.ok) throw new Error(body.message ?? "Não foi possível abrir o relatório.");
      setMetrics(body.metrics ?? []);
      setSummary(body.summary);
      setMessage(body.metrics?.length ? "Dados registrados a partir de etapas confirmadas." : "A primeira geração concluída criará o seu histórico.");
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível abrir o relatório."));
  }, []);

  return <div className="site-shell">
    <Header />
    <main className="report-page" aria-labelledby="report-title">
      <p className="state-kicker">Caderno de criação</p>
      <h1 id="report-title">Tempo e custo, sem adivinhação.</h1>
      <p className="report-page__intro">O Puleiro registra somente etapas confirmadas. O custo estimado é a reserva informada pelo Modal; valor faturado só aparece quando houver dado de cobrança disponível.</p>
      <p role="status" aria-live="polite">{message}</p>
      <section className="report-ledger" aria-label="Resumo de geração">
        <Metric label="Gerações concluídas" value={summary ? String(summary.completedRuns) : "—"} />
        <Metric label="Master típico" value={formatDuration(summary?.masterTypicalMs)} />
        <Metric label="Poses típicas" value={formatDuration(summary?.poseTypicalMs)} />
        <Metric label="Reserva estimada" value={formatUsd(summary?.estimatedCostUsd)} />
        <Metric label="Faturamento confirmado" value={summary?.hasActualCost ? formatUsd(summary.actualCostUsd) : "Ainda não disponível"} />
      </section>
      {metrics.length > 0 && <ol className="report-runs">{metrics.map((metric) => <li key={metric.id}><strong>{metric.stage === "master" ? "Mascote mestre" : "Três poses"}</strong><span>{metric.status === "completed" ? formatDuration(metric.durationMs) : "Em observação"}</span><time dateTime={metric.startedAt}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(metric.startedAt))}</time></li>)}</ol>}
    </main>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function formatDuration(value?: number) { if (!value) return "Ainda medindo"; const seconds = Math.round(value / 1000); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)} min ${seconds % 60}s`; }
function formatUsd(value?: number) { return value === undefined ? "Ainda não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value); }
