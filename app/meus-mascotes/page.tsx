"use client";

import { useEffect, useState } from "react";
import { AccountGate } from "@/components/auth/AccountGate";
import { Header } from "@/components/navigation/Header";
import type { MascotLibraryItem } from "@/lib/mascot-generation/types";

export default function MyMascotsPage() {
  return <AccountGate required><LibraryContent /></AccountGate>;
}

function LibraryContent() {
  const [items, setItems] = useState<MascotLibraryItem[]>([]);
  const [message, setMessage] = useState("Abrindo sua biblioteca privada…");

  useEffect(() => {
    void fetch("/api/mascot/library", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { items?: MascotLibraryItem[]; message?: string };
        if (!response.ok) throw new Error(body.message ?? "Não foi possível abrir sua biblioteca.");
        setItems(body.items ?? []);
        setMessage(body.items?.length ? "Seus mascotes ficam salvos somente nesta conta." : "Seu primeiro mascote aparecerá aqui depois que o conjunto estiver concluído.");
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível abrir sua biblioteca."));
  }, []);

  return <div className="site-shell">
    <Header />
    <main className="library-page">
      <span className="state-kicker">Biblioteca privada</span>
      <h1>Meus mascotes</h1>
      <p role="status" aria-live="polite">{message}</p>
      <ul className="library-grid">
        {items.map((item) => <li key={item.id}>
          <article className="library-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.poses[0]?.imageUrl} alt="Prévia da pose normal do mascote salvo." />
            <div><span>Código do mascote</span><strong>{item.mascotCode}</strong></div>
          </article>
        </li>)}
      </ul>
    </main>
  </div>;
}
