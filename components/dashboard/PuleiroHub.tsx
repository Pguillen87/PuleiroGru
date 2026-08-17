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
          <p>Crie um novo companheiro, cuide da sua coleção e descubra personagens que ganharam lugar no Puleiro.</p>
          <Link className="stage-button stage-button--primary" href="/criar">Criar meu mascote</Link>
        </div>
        <span className="hub-stage__seal" aria-hidden="true">◌</span>
      </section>
      <section className="hub-doors" aria-label="Caminhos do Puleiro">
        <Link href="/meus-mascotes"><strong>Minha biblioteca</strong><span>Seus mascotes, favoritos e códigos.</span></Link>
        <Link href="/explorar"><strong>Explorar comunidade</strong><span>Personagens publicados por seus criadores.</span></Link>
      </section>
    </main>
  </div>;
}
