"use client";

import Link from "next/link";
import { Header } from "@/components/navigation/Header";

export function PuleiroHub() {
  return <div className="site-shell hub-shell">
    <Header />
    <main className="hub-page" aria-labelledby="hub-title">
      <section className="hub-stage">
        <div>
          <p className="state-kicker">Central do Puleiro</p>
          <h1 id="hub-title">Todo mascote começa por aqui.</h1>
          <p>Crie um companheiro, acompanhe o nascimento, cuide da sua coleção e descubra personagens que ganharam lugar no Puleiro.</p>
          <Link className="stage-button stage-button--primary" href="/criar">Criar meu mascote</Link>
        </div>
        <span className="hub-stage__seal" aria-hidden="true">◌</span>
      </section>
      <section className="hub-doors" aria-label="Caminhos do Puleiro">
        <Link href="/incubadora"><strong>Incubadora</strong><span>Acompanhe trabalhos e abra mascotes prontos.</span></Link>
        <Link href="/meus-mascotes"><strong>Meus Mascotes</strong><span>Organize seus mascotes concluídos e favoritos.</span></Link>
        <Link href="/explorar"><strong>Biblioteca Geral</strong><span>Conheça mascotes publicados pela comunidade.</span></Link>
        <Link href="/criar"><strong>Criar</strong><span>Envie uma foto e defina as referências uma vez.</span></Link>
      </section>
    </main>
  </div>;
}
