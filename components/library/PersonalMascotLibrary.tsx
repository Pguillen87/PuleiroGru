"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Header } from "@/components/navigation/Header";
import type { MascotLibraryItem } from "@/lib/mascot-generation/types";

type SortOption = "newest" | "oldest" | "code";
type FilterOption = "all" | "favorites";

const sortLabels: Record<SortOption, string> = { newest: "Mais recentes", oldest: "Mais antigos", code: "Código do mascote" };

export function PersonalMascotLibrary() {
  const [items, setItems] = useState<MascotLibraryItem[]>([]);
  const [message, setMessage] = useState("Abrindo sua biblioteca privada…");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [filter, setFilter] = useState<FilterOption>("all");

  useEffect(() => { void loadLibrary(setItems, setMessage); }, []);
  const visibleItems = useMemo(() => selectLibraryItems(items, query, filter, sort), [filter, items, query, sort]);

  return <div className="site-shell">
    <Header />
    <main className="library-page">
      <section className="library-intro" aria-labelledby="library-title">
        <div>
          <span className="state-kicker">Biblioteca pessoal</span>
          <h1 id="library-title">Meus mascotes</h1>
          <p>Seus mascotes criados ficam aqui. Os favoritos que você salvar do Puleiro também aparecerão nesta coleção.</p>
        </div>
        <p className="library-count" aria-live="polite">{items.length} {items.length === 1 ? "mascote" : "mascotes"}</p>
      </section>
      <LibraryControls filter={filter} query={query} sort={sort} onFilter={setFilter} onQuery={setQuery} onSort={setSort} />
      <p className="library-status" role="status" aria-live="polite">{message}</p>
      {visibleItems.length > 0 ? <ul className="library-grid" aria-label="Mascotes salvos">
        {visibleItems.map((item) => <li key={item.id}><LibraryItem item={item} onChange={setItems} /></li>)}
      </ul> : <LibraryEmptyState hasItems={items.length > 0} />}
    </main>
  </div>;
}

function LibraryControls({ filter, query, sort, onFilter, onQuery, onSort }: {
  filter: FilterOption; query: string; sort: SortOption;
  onFilter: (value: FilterOption) => void; onQuery: (value: string) => void; onSort: (value: SortOption) => void;
}) {
  return <section className="library-controls" aria-label="Organizar biblioteca">
    <label className="library-search"><span className="sr-only">Buscar por código</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar por código" type="search" /></label>
    <div className="library-filter" role="group" aria-label="Filtrar biblioteca">
      <button type="button" aria-pressed={filter === "all"} onClick={() => onFilter("all")}>Todos</button>
      <button type="button" aria-pressed={filter === "favorites"} onClick={() => onFilter("favorites")}>Favoritos</button>
    </div>
    <label className="library-sort"><span>Ordenar</span><select value={sort} onChange={(event) => onSort(event.target.value as SortOption)}>
      {(Object.keys(sortLabels) as SortOption[]).map((option) => <option key={option} value={option}>{sortLabels[option]}</option>)}
    </select></label>
  </section>;
}

function LibraryItem({ item, onChange }: { item: MascotLibraryItem; onChange: Dispatch<SetStateAction<MascotLibraryItem[]>> }) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const imageUrl = item.poses.find((pose) => pose.role === "normal")?.imageUrl ?? item.poses[0]?.imageUrl;

  async function copyCode() {
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(item.mascotCode);
      setCopied(true);
      setActionError("");
    } catch { setActionError("Não foi possível copiar o código neste navegador."); }
  }

  async function toggleFavorite() {
    setSaving(true);
    try {
      const response = await fetch(`/api/mascot/library/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isFavorite: !item.isFavorite }) });
      if (!response.ok) throw new Error("Não foi possível atualizar o favorito.");
      const body = await response.json() as { item: MascotLibraryItem };
      onChange((current) => current.map((entry) => entry.id === item.id ? { ...entry, isFavorite: body.item.isFavorite } : entry));
      setActionError("");
    } catch { setActionError("Não foi possível atualizar o favorito agora."); }
    finally { setSaving(false); }
  }

  return <article className="library-item">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={imageUrl} alt="Pose normal do mascote salvo." />
    <button
      type="button"
      className="library-item__favorite"
      aria-pressed={item.isFavorite}
      aria-label={item.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      disabled={saving}
      onClick={() => void toggleFavorite()}
    ><span aria-hidden="true">★</span></button>
    <div className="library-item__body">
      <div className="library-item__heading"><span>Conjunto de três poses</span><strong>{item.mascotCode}</strong></div>
      <p>{formatCreatedAt(item.createdAt)}</p>
      <div className="library-item__actions">
        <button type="button" onClick={() => void copyCode()}>{copied ? "Código copiado" : "Copiar código"}</button>
        <button type="button" className="library-item__open-gru" disabled title="Disponível quando existir um pacote compatível com o aplicativo GRU.">Abrir no GRU em breve</button>
      </div>
      {actionError && <p className="library-item__error" role="alert">{actionError}</p>}
    </div>
  </article>;
}

function LibraryEmptyState({ hasItems }: { hasItems: boolean }) {
  return <section className="library-empty" aria-labelledby="library-empty-title">
    <h2 id="library-empty-title">{hasItems ? "Nenhum mascote encontrado" : "Seu primeiro mascote vai morar aqui"}</h2>
    <p>{hasItems ? "Tente outro código ou filtro." : "Quando um conjunto for concluído, ele ficará salvo nesta conta."}</p>
    {!hasItems && <Link className="stage-button stage-button--primary" href="/">Criar meu mascote</Link>}
  </section>;
}

async function loadLibrary(setItems: Dispatch<SetStateAction<MascotLibraryItem[]>>, setMessage: Dispatch<SetStateAction<string>>) {
  try {
    const response = await fetch("/api/mascot/library", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { items?: MascotLibraryItem[]; message?: string };
    if (!response.ok) throw new Error(body.message ?? "Não foi possível abrir sua biblioteca.");
    setItems(body.items ?? []);
    setMessage(body.items?.length ? "Organize, favorite e copie o código de qualquer mascote." : "Seu primeiro mascote aparecerá aqui depois que o conjunto estiver concluído.");
  } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível abrir sua biblioteca."); }
}

function selectLibraryItems(items: MascotLibraryItem[], query: string, filter: FilterOption, sort: SortOption) {
  const normalizedQuery = query.trim().toUpperCase();
  return items.filter((item) => (filter !== "favorites" || item.isFavorite) && (!normalizedQuery || item.mascotCode.includes(normalizedQuery))).toSorted((a, b) => {
    if (sort === "code") return a.mascotCode.localeCompare(b.mascotCode, "pt-BR");
    const newestFirst = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sort === "newest" ? newestFirst : -newestFirst;
  });
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
