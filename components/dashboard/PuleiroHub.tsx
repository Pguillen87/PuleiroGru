"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/navigation/Header";

type ReportSummary = { totalRuns: number; completedRuns: number };

export function PuleiroHub() {
  const [summary, setSummary] = useState<ReportSummary>();

  useEffect(() => {
    void fetch("/api/mascot/reports", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ summary: ReportSummary }> : null)
      .then((payload) => setSummary(payload?.summary));
  }, []);

  return <div className="site-shell hub-shell">
    <Header />
    <main className="hub-page" aria-labelledby="hub-title">
      <section className="hub-stage">
        <div>
          <p className="state-kicker">Central do Puleiro</p>
          <h1 id="hub-title">Todo mascote começa por aqui.</h1>
          <p>Crie um novo companheiro, cuide da sua coleção e descubra personagens que ganharam lugar no Puleiro.</p>
          <Link className="stage-button stage-button--primary" href="/criar">Criar meu mascote</Link>
        </div>
        <span className="hub-stage__seal" aria-hidden="true">◌</span>
      </section>
      <section className="hub-doors" aria-label="Caminhos do Puleiro">
        <Link href="/meus-mascotes"><strong>Minha biblioteca</strong><span>Seus mascotes, favoritos e códigos.</span></Link>
        <Link href="/explorar"><strong>Explorar comunidade</strong><span>Personagens publicados por seus criadores.</span></Link>
        <Link href="/relatorios"><strong>Caderno de criação</strong><span>{summary ? `${summary.completedRuns} gerações concluídas registradas.` : "Tempos e custos observados com transparência."}</span></Link>
      </section>
    </main>
  </div>;
}
