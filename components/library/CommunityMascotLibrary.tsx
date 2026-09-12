"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/navigation/Header";
import type { CommunityMascot } from "@/lib/mascot-generation/types";

export function CommunityMascotLibrary() {
  const [items, setItems] = useState<CommunityMascot[]>([]);
  const [sort, setSort] = useState<"new" | "favorites">("new");
  const [message, setMessage] = useState("Abrindo a comunidade…");
  const requestedAction = useSyncExternalStore(() => () => undefined, readRequestedCommunityAction, () => null);
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
    {sorted.length > 0 && <ul className="library-grid" aria-label="Mascotes da comunidade">{sorted.map((item, index) => <li key={item.id}><CommunityItem item={item} priority={index < 4} autoAction={requestedAction === `copy:${item.id}` ? "copy" : requestedAction === `favorite:${item.id}` ? "favorite" : requestedAction === `save:${item.id}` ? "save" : undefined} onUpdate={(updated) => setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry))} /></li>)}</ul>}
  </main></div>;
}

function CommunityItem({ item, priority, autoAction, onUpdate }: { item: CommunityMascot; priority: boolean; autoAction?: "copy" | "favorite" | "save"; onUpdate: (item: CommunityMascot) => void }) {
  const [error, setError] = useState("");
  const [copyOpen, setCopyOpen] = useState(autoAction === "copy");
  const [dismissedAutoOpen, setDismissedAutoOpen] = useState(false);
  const [copyName, setCopyName] = useState(`Mascote ${item.mascotCode}`.slice(0, 32));
  const [copyState, setCopyState] = useState<"idle" | "busy" | "done">("idle");
  const autoActionHandled = useRef(false);
  const imageUrl = item.poses.find((pose) => pose.role === "normal")?.imageUrl;
  const router = useRouter();
  const isCopyOpen = copyOpen || (autoAction === "copy" && !dismissedAutoOpen);
  const change = useCallback(async (kind: "favorite" | "save") => {
    const key = kind === "favorite" ? "isFavorited" : "isSaved";
    const enabled = !item[key];
    try {
      const response = await fetch(`/api/mascot/community/${encodeURIComponent(item.id)}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      const body = await response.json().catch(() => ({})) as { item?: CommunityMascot; message?: string };
      if (response.status === 401) {
        router.push(`/meus-mascotes?returnTo=${encodeURIComponent(`/explorar?action=${kind}&item=${item.id}`)}`);
        return;
      }
      if (!response.ok || !body.item) throw new Error(body.message ?? "Não foi possível atualizar agora.");
      onUpdate(body.item); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar agora."); }
  }, [item, onUpdate, router]);
  useEffect(() => {
    if (!autoAction || autoActionHandled.current || autoAction === "copy") return;
    autoActionHandled.current = true;
    void change(autoAction);
  }, [autoAction, change]);
  async function copyMascot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCopyState("busy"); setError("");
    try {
      const response = await fetch(`/api/mascot/community/${encodeURIComponent(item.id)}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: copyName }),
      });
      const body = await response.json().catch(() => ({})) as { message?: string; item?: unknown };
      if (response.status === 401) {
        router.push(`/meus-mascotes?returnTo=${encodeURIComponent(`/explorar?action=copy&item=${item.id}`)}`);
        return;
      }
      if (!response.ok || !body.item) throw new Error(body.message ?? "Não foi possível guardar a cópia agora.");
      setCopyState("done");
    } catch (reason) {
      setCopyState("idle"); setError(reason instanceof Error ? reason.message : "Não foi possível guardar a cópia agora.");
    }
  }
  return <article className="library-item">
    <div className="library-item__preview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Prévia do mascote publicado no Puleiro." loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" width="320" height="400" />
    </div>
    <div className="library-item__body"><div className="library-item__heading"><span>Mascote público</span><strong>{item.mascotCode}</strong></div><p>{item.favoriteCount} favoritos · {item.saveCount} salvos</p><div className="library-item__actions"><button type="button" aria-pressed={item.isFavorited} onClick={() => void change("favorite")}>{item.isFavorited ? "★ Favoritado" : "☆ Favoritar"}</button><button type="button" onClick={() => void change("save")}>{item.isSaved ? "Salvo na biblioteca" : "Salvar na biblioteca"}</button><button type="button" onClick={() => { setCopyOpen(true); setDismissedAutoOpen(false); setCopyState("idle"); }}>{copyState === "done" ? "Cópia guardada" : "Usar este mascote"}</button></div>{isCopyOpen && <section className="library-item__copy-confirmation" role="dialog" aria-labelledby={`copy-title-${item.id}`}><h2 id={`copy-title-${item.id}`}>Usar este mascote?</h2>{copyState === "done" ? <><p>A cópia independente foi guardada em Meus Mascotes. O crédito do criador original permanece preservado.</p><a className="library-item__community-link" href="/meus-mascotes">Abrir Meus Mascotes</a></> : <form onSubmit={copyMascot}><p>Será criada uma cópia independente apenas dos assets operacionais. A foto original e o Master privado não serão copiados.</p><label htmlFor={`copy-name-${item.id}`}>Nome sugerido</label><input id={`copy-name-${item.id}`} value={copyName} maxLength={32} minLength={2} onChange={(event) => setCopyName(event.target.value)} required /><p>O crédito do criador original será mantido na procedência da cópia.</p><div className="library-item__actions"><button type="submit" disabled={copyState === "busy"}>{copyState === "busy" ? "Preparando…" : "Confirmar cópia"}</button><button type="button" onClick={() => { setCopyOpen(false); setDismissedAutoOpen(true); }} disabled={copyState === "busy"}>Cancelar</button></div></form>}</section>}{error && <p className="library-item__error" role="alert">{error}</p>}</div>
  </article>;
}

function readRequestedCommunityAction() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  const item = params.get("item");
  return action && item && ["copy", "favorite", "save"].includes(action) ? `${action}:${item}` : null;
}
