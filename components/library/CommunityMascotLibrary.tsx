"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/navigation/Header";
import type { CommunityMascot } from "@/lib/mascot-generation/types";

export function CommunityMascotLibrary() {
  const [items, setItems] = useState<CommunityMascot[]>([]);
  const [sort, setSort] = useState<"new" | "favorites">("new");
  const [message, setMessage] = useState("Abrindo a comunidade…");
  useEffect(() => { void fetch("/api/mascot/community", { cache: "no-store" }).then(async (response) => {
    const body = await response.json().catch(() => ({})) as { items?: CommunityMascot[]; message?: string };
    if (!response.ok) throw new Error(body.message ?? "Não foi possível abrir a comunidade.");
    setItems(body.items ?? []); setMessage(body.items?.length ? "Mascotes publicados pelos seus criadores." : "A comunidade está esperando o primeiro mascote publicado.");
  }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível abrir a comunidade.")); }, []);
  const sorted = useMemo(() => [...items].sort((a, b) => sort === "favorites" ? b.favoriteCount - a.favoriteCount || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) : Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), [items, sort]);
  return <div className="site-shell"><Header /><main className="library-page" aria-labelledby="community-title">
    <section className="library-intro"><div><span className="state-kicker">Comunidade do Puleiro</span><h1 id="community-title">Explorar mascotes</h1><p>Somente personagens que seus criadores escolheram disponibilizar aparecem aqui.</p></div><button className="community-sort" type="button" onClick={() => setSort((current) => current === "new" ? "favorites" : "new")}>{sort === "new" ? "Mais recentes" : "Mais favoritados"}</button></section>
    <p className="library-status" role="status">{message}</p>
    <p className="community-auth-note">Você pode explorar livremente. Entre para favoritar ou guardar um mascote na sua biblioteca.</p>
    {sorted.length > 0 && <ul className="library-grid" aria-label="Mascotes da comunidade">{sorted.map((item, index) => <li key={item.id}><CommunityItem item={item} priority={index < 4} onUpdate={(updated) => setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry))} /></li>)}</ul>}
  </main></div>;
}

function CommunityItem({ item, priority, onUpdate }: { item: CommunityMascot; priority: boolean; onUpdate: (item: CommunityMascot) => void }) {
  const [error, setError] = useState("");
  const imageUrl = item.poses.find((pose) => pose.role === "normal")?.imageUrl;
  async function change(kind: "favorite" | "save") {
    const key = kind === "favorite" ? "isFavorited" : "isSaved";
    const enabled = !item[key];
    try {
      const response = await fetch(`/api/mascot/community/${encodeURIComponent(item.id)}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      const body = await response.json().catch(() => ({})) as { item?: CommunityMascot; message?: string };
      if (!response.ok || !body.item) throw new Error(body.message ?? "Não foi possível atualizar agora.");
      onUpdate(body.item); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar agora."); }
  }
  return <article className="library-item">
    <div className="library-item__preview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Prévia do mascote publicado no Puleiro." loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" width="320" height="400" />
    </div>
    <div className="library-item__body"><div className="library-item__heading"><span>Mascote público</span><strong>{item.mascotCode}</strong></div><p>{item.favoriteCount} favoritos · {item.saveCount} salvos</p><div className="library-item__actions"><button type="button" aria-pressed={item.isFavorited} onClick={() => void change("favorite")}>{item.isFavorited ? "★ Favoritado" : "☆ Favoritar"}</button><button type="button" onClick={() => void change("save")}>{item.isSaved ? "Salvo na biblioteca" : "Salvar na biblioteca"}</button></div>{error && <p className="library-item__error" role="alert">{error}</p>}</div>
  </article>;
}
