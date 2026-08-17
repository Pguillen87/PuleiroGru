"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/navigation/Header";
import type { CommunityMascot, MascotLibraryItem } from "@/lib/mascot-generation/types";

type SortOption = "newest" | "oldest" | "code";
type FilterOption = "all" | "favorites";

const sortLabels: Record<SortOption, string> = { newest: "Mais recentes", oldest: "Mais antigos", code: "Código do mascote" };
const PAGE_SIZE = 24;

export function PersonalMascotLibrary() {
  const [items, setItems] = useState<MascotLibraryItem[]>([]);
  const [message, setMessage] = useState("Abrindo sua biblioteca privada…");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [communityItems, setCommunityItems] = useState<CommunityMascot[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadLibrary({ query, filter, sort, signal: controller.signal }).then((page) => {
        if (!page) return;
        if (page.error) {
          setItems([]);
          setTotal(0);
          setNextOffset(null);
          setMessage(page.error);
          return;
        }
        setItems(page.items);
        setTotal(page.total);
        setNextOffset(page.nextOffset);
        setMessage(page.items.length
          ? "Organize, favorite e copie o código de qualquer mascote."
          : query || filter === "favorites"
            ? "Nenhum mascote corresponde a esta busca."
            : "Seu primeiro mascote aparecerá aqui depois que o conjunto estiver concluído.");
      });
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filter, query, sort]);
  useEffect(() => {
    void fetch("/api/mascot/community/saved", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { items?: CommunityMascot[] };
        if (response.ok) setCommunityItems(body.items ?? []);
      });
  }, []);
  const visibleItems = useMemo(() => selectLibraryItems(items, query, filter, sort), [filter, items, query, sort]);

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    const page = await loadLibrary({ query, filter, sort, offset: nextOffset });
    if (page?.error) setMessage(page.error);
    else if (page) {
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((entry) => entry.id === item.id))]);
      setTotal(page.total);
      setNextOffset(page.nextOffset);
    }
    setLoadingMore(false);
  }

  return <div className="site-shell">
    <Header />
    <main className="library-page">
      <section className="library-intro" aria-labelledby="library-title">
        <div>
          <span className="state-kicker">Biblioteca pessoal</span>
          <h1 id="library-title">Meus mascotes</h1>
          <p>Seus mascotes criados ficam aqui. Os favoritos que você salvar do Puleiro também aparecerão nesta coleção.</p>
        </div>
        <p className="library-count" aria-live="polite">{total} {total === 1 ? "mascote" : "mascotes"}</p>
      </section>
      <LibraryControls filter={filter} query={query} sort={sort} onFilter={setFilter} onQuery={setQuery} onSort={setSort} />
      <p className="library-status" role="status" aria-live="polite">{message}</p>
      {visibleItems.length > 0 ? <ul className="library-grid" aria-label="Mascotes salvos">
        {visibleItems.map((item, index) => <li key={item.id}><LibraryItem
          item={item}
          priority={index < 4}
          selected={selectedItemId === item.id}
          onSelect={(selectedItem) => {
            setSelectedItemId(selectedItem.id);
            setMessage(`Mascote ${selectedItem.mascotCode} selecionado. Você pode copiar o código ou marcar como favorito.`);
          }}
          onFavoriteUpdate={(itemId, isFavorite) => {
            setItems((current) => current.map((entry) => entry.id === itemId ? { ...entry, isFavorite } : entry));
            if (filter === "favorites" && !isFavorite) setTotal((current) => Math.max(0, current - 1));
          }}
        /></li>)}
      </ul> : <LibraryEmptyState hasItems={total > 0 || Boolean(query) || filter === "favorites"} />}
      {nextOffset !== null && <button className="library-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
        {loadingMore ? "Carregando mascotes…" : "Carregar mais mascotes"}
      </button>}
      {communityItems.length > 0 && <section className="library-community-saves" aria-labelledby="community-saves-title">
        <div>
          <span className="state-kicker">Guardados no Puleiro</span>
          <h2 id="community-saves-title">Favoritos e mascotes salvos</h2>
          <p>Personagens públicos que você guardou continuam acessíveis nesta conta.</p>
        </div>
        <ul className="library-grid" aria-label="Mascotes públicos salvos">
          {communityItems.map((item) => <li key={item.id}><SavedCommunityItem item={item} /></li>)}
        </ul>
      </section>}
    </main>
  </div>;
}

function SavedCommunityItem({ item }: { item: CommunityMascot }) {
  const imageUrl = item.poses.find((pose) => pose.role === "normal")?.imageUrl;
  return <article className="library-item library-item--community">
    <div className="library-item__preview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={`Prévia do mascote público ${item.mascotCode}.`} loading="lazy" decoding="async" width="320" height="400" />
    </div>
    <div className="library-item__body">
      <div className="library-item__heading"><span>Mascote do Puleiro</span><strong>{item.mascotCode}</strong></div>
      <p>{item.isFavorited ? "Favorito" : "Salvo"} · {item.favoriteCount} favoritos</p>
      <Link href="/explorar" className="library-item__community-link">Ver na comunidade</Link>
    </div>
  </article>;
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

function LibraryItem({ item, priority, selected, onSelect, onFavoriteUpdate }: {
  item: MascotLibraryItem;
  priority: boolean;
  selected: boolean;
  onSelect: (item: MascotLibraryItem) => void;
  onFavoriteUpdate: (itemId: string, isFavorite: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(Boolean(item.isPublic));
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
      onFavoriteUpdate(item.id, body.item.isFavorite);
      setActionError("");
    } catch { setActionError("Não foi possível atualizar o favorito agora."); }
    finally { setSaving(false); }
  }

  async function togglePublication() {
    setSaving(true);
    try {
      const response = await fetch(`/api/mascot/library/${encodeURIComponent(item.id)}/publication`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !published }) });
      const body = await response.json().catch(() => ({})) as { published?: boolean; message?: string };
      if (!response.ok || typeof body.published !== "boolean") throw new Error(body.message ?? "Não foi possível atualizar a publicação.");
      setPublished(body.published); setActionError("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "Não foi possível atualizar a publicação."); }
    finally { setSaving(false); }
  }

  return <article className="library-item" data-selected={selected || undefined}>
    <button
      type="button"
      className="library-item__preview"
      aria-pressed={selected}
      aria-label={`Selecionar mascote ${item.mascotCode}`}
      onClick={() => onSelect(item)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        width="320"
        height="400"
      />
      <span aria-hidden="true" className="library-item__preview-label">Ver conjunto</span>
    </button>
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
        <button type="button" onClick={() => void togglePublication()} disabled={saving}>{published ? "Remover da comunidade" : "Publicar no Puleiro"}</button>
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

type LibraryPage = { items: MascotLibraryItem[]; total: number; nextOffset: number | null; error?: string };

async function loadLibrary({ query, filter, sort, offset = 0, signal }: {
  query: string; filter: FilterOption; sort: SortOption; offset?: number; signal?: AbortSignal;
}): Promise<LibraryPage | null> {
  try {
    const parameters = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE), query, filter, sort });
    const response = await fetch(`/api/mascot/library?${parameters}`, { cache: "no-store", signal });
    const body = await response.json().catch(() => ({})) as Partial<LibraryPage> & { message?: string };
    if (!response.ok) throw new Error(body.message ?? "Não foi possível abrir sua biblioteca.");
    return { items: body.items ?? [], total: body.total ?? 0, nextOffset: body.nextOffset ?? null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return {
      items: [],
      total: 0,
      nextOffset: null,
      error: error instanceof Error ? error.message : "Não foi possível abrir sua biblioteca.",
    };
  }
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
