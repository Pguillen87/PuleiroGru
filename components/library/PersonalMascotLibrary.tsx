"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Header } from "@/components/navigation/Header";
import type { CommunityMascot, MascotLibraryItem } from "@/lib/mascot-generation/types";

type SortOption = "newest" | "oldest" | "code";
type FilterOption = "all" | "favorites";
type FeedbackTone = "success" | "error";

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
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [footerFeedback, setFooterFeedback] = useState<{ message: string; tone: FeedbackTone } | null>(null);

  useEffect(() => {
    if (!footerFeedback) return;
    const timer = window.setTimeout(() => setFooterFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [footerFeedback]);

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
  }, [filter, libraryRevision, query, sort]);
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
          catalogNumber={index + 1}
          selected={selectedItemId === item.id}
          onSelect={(selectedItem) => {
            setSelectedItemId(selectedItem.id);
            setMessage(`${selectedItem.displayName} selecionado. Você pode copiar o código ou marcar como favorito.`);
          }}
          onFavoriteUpdate={(itemId, isFavorite) => {
            setItems((current) => current.map((entry) => entry.id === itemId ? { ...entry, isFavorite } : entry));
            if (filter === "favorites" && !isFavorite) setTotal((current) => Math.max(0, current - 1));
          }}
          onCollectionRefresh={(nextMessage) => {
            setLibraryRevision((revision) => revision + 1);
            setMessage(nextMessage);
          }}
          onFeedback={(nextMessage, tone = "success") => setFooterFeedback({ message: nextMessage, tone })}
          onItemUpdate={(updated) => setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry))}
          onItemRemove={(itemId) => {
            setItems((current) => current.filter((entry) => entry.id !== itemId));
            setTotal((current) => Math.max(0, current - 1));
            if (selectedItemId === itemId) setSelectedItemId(null);
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
      {footerFeedback && <p className={`library-footer-feedback library-footer-feedback--${footerFeedback.tone}`} role={footerFeedback.tone === "error" ? "alert" : "status"} aria-live="polite">{footerFeedback.message}</p>}
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

function LibraryItem({ item, priority, catalogNumber, selected, onSelect, onFavoriteUpdate, onCollectionRefresh, onFeedback, onItemUpdate, onItemRemove }: {
  item: MascotLibraryItem;
  priority: boolean;
  catalogNumber: number;
  selected: boolean;
  onSelect: (item: MascotLibraryItem) => void;
  onFavoriteUpdate: (itemId: string, isFavorite: boolean) => void;
  onCollectionRefresh: (message: string) => void;
  onFeedback: (message: string, tone?: FeedbackTone) => void;
  onItemUpdate: (item: MascotLibraryItem) => void;
  onItemRemove: (itemId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(Boolean(item.isPublic));
  const [packaging, setPackaging] = useState(false);
  const [packageReady, setPackageReady] = useState(false);
  const [packageSuccessOpen, setPackageSuccessOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.displayName);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [posesOpen, setPosesOpen] = useState(false);
  const [favoriteRankDraft, setFavoriteRankDraft] = useState(String(item.favoriteRank ?? ""));
  const closeSuccessRef = useRef<HTMLButtonElement>(null);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  const closePosesRef = useRef<HTMLButtonElement>(null);
  const imageUrl = item.poses.find((pose) => pose.role === "normal")?.imageUrl ?? item.poses[0]?.imageUrl;

  useEffect(() => {
    if (!packageSuccessOpen) return;
    closeSuccessRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPackageSuccessOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [packageSuccessOpen]);

  useEffect(() => {
    if (!moreActionsOpen) return;
    const closeOutsideMenu = (event: PointerEvent) => {
      if (!moreActionsRef.current?.contains(event.target as Node)) setMoreActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreActionsOpen(false); };
    window.addEventListener("pointerdown", closeOutsideMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutsideMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreActionsOpen]);

  async function copyCode() {
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(item.mascotCode);
      setCopied(true);
    } catch { onFeedback("Não foi possível copiar o código neste navegador.", "error"); }
  }

  async function toggleFavorite() {
    setSaving(true);
    try {
      const response = await fetch(`/api/mascot/library/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isFavorite: !item.isFavorite }) });
      if (!response.ok) throw new Error("Não foi possível atualizar o favorito.");
      const body = await response.json() as { item: MascotLibraryItem };
      onFavoriteUpdate(item.id, body.item.isFavorite);
      setFavoriteRankDraft(body.item.isFavorite ? String(body.item.favoriteRank ?? "") : "");
      onCollectionRefresh(body.item.isFavorite
        ? `${item.displayName} entrou nos favoritos dourados.`
        : `${item.displayName} saiu dos favoritos.`);
    } catch { onFeedback("Não foi possível atualizar o favorito agora.", "error"); }
    finally { setSaving(false); }
  }

  async function saveFavoriteRank() {
    const favoriteRank = Number.parseInt(favoriteRankDraft, 10);
    if (!Number.isInteger(favoriteRank) || favoriteRank < 1) {
      onFeedback("Informe uma posição começando em 1.", "error");
      return;
    }
    if (favoriteRank === item.favoriteRank) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/mascot/library/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favoriteRank }),
      });
      const body = await response.json().catch(() => ({})) as { item?: MascotLibraryItem; message?: string };
      if (!response.ok || !body.item) throw new Error(body.message ?? "Não foi possível reorganizar os favoritos.");
      setFavoriteRankDraft(String(body.item.favoriteRank ?? ""));
      onItemUpdate(body.item);
      onCollectionRefresh(`${item.displayName} agora ocupa a posição dourada ${body.item.favoriteRank}.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível reorganizar os favoritos agora.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function renameMascot(displayName: string) {
    setSaving(true);
    try {
      const response = await fetch(`/api/mascot/library/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }) });
      const body = await response.json().catch(() => ({})) as { item?: MascotLibraryItem; message?: string };
      if (!response.ok || !body.item) throw new Error(body.message ?? "Não foi possível alterar o nome.");
      onItemUpdate(body.item);
      setEditingName(false);
      onFeedback("Nome salvo. Prepare o pacote Android novamente para atualizar o GRU.");
    } catch (error) { onFeedback(error instanceof Error ? error.message : "Não foi possível alterar o nome.", "error"); }
    finally { setSaving(false); }
  }

  async function deleteMascot() {
    setSaving(true);
    try {
      const response = await fetch(`/api/mascot/library/${encodeURIComponent(item.id)}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Não foi possível excluir este mascote agora.");
      onItemRemove(item.id);
    } catch (error) { onFeedback(error instanceof Error ? error.message : "Não foi possível excluir este mascote agora.", "error"); }
    finally { setSaving(false); setDeleteDialogOpen(false); }
  }

  async function togglePublication() {
    setSaving(true);
    try {
      const response = await fetch(`/api/mascot/library/${encodeURIComponent(item.id)}/publication`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !published }) });
      const body = await response.json().catch(() => ({})) as { published?: boolean; message?: string };
      if (!response.ok || typeof body.published !== "boolean") throw new Error(body.message ?? "Não foi possível atualizar a publicação.");
      setPublished(body.published);
    } catch (error) { onFeedback(error instanceof Error ? error.message : "Não foi possível atualizar a publicação.", "error"); }
    finally { setSaving(false); }
  }

  async function prepareAndroidPackage() {
    setPackaging(true);
    try {
      const response = await fetch(`/api/mascot/library/${encodeURIComponent(item.id)}/package`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = await response.json().catch(() => ({})) as { code?: string; message?: string };
      if (!response.ok || !body.code) throw new Error(body.message ?? "Não foi possível preparar o pacote agora.");
      setPackageReady(true);
      setPackageSuccessOpen(true);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível preparar o pacote agora.", "error");
    } finally {
      setPackaging(false);
    }
  }

  return <article className="library-item" data-selected={selected || undefined} data-favorite={item.isFavorite || undefined}>
    <button
      type="button"
      className="library-item__preview"
      aria-label={`Ver as três poses de ${item.displayName}`}
      onClick={() => { onSelect(item); setPosesOpen(true); }}
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
      <span aria-hidden="true" className="library-item__preview-label">Ver 3 poses</span>
    </button>
    {!item.isFavorite && <span className="library-item__catalog-number" aria-hidden="true">{`Fig. ${String(catalogNumber).padStart(2, "0")}`}</span>}
    <div className="library-item__media-actions">
      <button
        type="button"
        className="library-item__favorite"
        aria-pressed={item.isFavorite}
        aria-label={item.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        disabled={saving}
        onClick={() => void toggleFavorite()}
      ><StarIcon filled={item.isFavorite} /></button>
      <div ref={moreActionsRef} className="library-item__more-actions">
        <button type="button" className="library-item__more-trigger" aria-expanded={moreActionsOpen} aria-controls={`mascot-actions-${item.id}`} aria-label={`Mais ações para ${item.displayName}`} disabled={saving} onClick={() => setMoreActionsOpen((open) => !open)}><MoreIcon /></button>
        {moreActionsOpen && <div id={`mascot-actions-${item.id}`} className="library-item__more-menu" role="group" aria-label={`Ações para ${item.displayName}`}>
          {item.isFavorite && <form className="library-item__favorite-position" onSubmit={(event) => { event.preventDefault(); void saveFavoriteRank(); }}>
            <label htmlFor={`favorite-rank-${item.id}`}>Ordem dourada</label>
            <div>
              <input id={`favorite-rank-${item.id}`} type="number" inputMode="numeric" min={1} max={10_000} value={favoriteRankDraft} disabled={saving} onChange={(event) => setFavoriteRankDraft(event.target.value)} />
              <button type="submit" disabled={saving}>Atualizar</button>
            </div>
          </form>}
          <button type="button" onClick={() => { setMoreActionsOpen(false); void togglePublication(); }}>{published ? "Remover da comunidade" : "Publicar no Puleiro"}</button>
          <button type="button" className="library-item__delete" onClick={() => { setMoreActionsOpen(false); setDeleteDialogOpen(true); }}>Excluir mascote</button>
        </div>}
      </div>
    </div>
    <div className="library-item__body">
      <div className="library-item__heading">
        <span className="library-item__eyebrow">Conjunto · 3 poses</span>
        {editingName ? <form className="library-item__rename-form" onSubmit={(event) => { event.preventDefault(); void renameMascot(nameDraft); }}>
          <label className="sr-only" htmlFor={`mascot-name-${item.id}`}>Nome do mascote</label>
          <input id={`mascot-name-${item.id}`} autoFocus value={nameDraft} maxLength={32} onChange={(event) => setNameDraft(event.target.value)} required />
          <button type="submit" aria-label="Salvar nome" disabled={saving || nameDraft.trim().length < 2}><span aria-hidden="true">✓</span></button>
          <button type="button" aria-label="Cancelar edição do nome" disabled={saving} onClick={() => { setNameDraft(item.displayName); setEditingName(false); }}><span aria-hidden="true">×</span></button>
        </form> : <div className="library-item__name-row">
          <strong>{item.displayName}</strong>
          <button type="button" className="library-item__rename" aria-label={`Renomear ${item.displayName}`} disabled={saving} onClick={() => { setNameDraft(item.displayName); setEditingName(true); }}><PencilIcon /></button>
        </div>}
      </div>
      <div className="library-item__identity">
        <code title={item.mascotCode}>{item.mascotCode}</code>
        <time className="library-item__date" dateTime={item.createdAt}>{formatCreatedAt(item.createdAt)}</time>
      </div>
      <div className="library-item__actions">
        <button type="button" onClick={() => void copyCode()}>{copied ? "Código copiado" : "Copiar código"}</button>
        <button
          type="button"
          className="library-item__open-gru"
          disabled={saving || packaging || packageReady}
          onClick={() => void prepareAndroidPackage()}
          title="Prepara o pacote privado para importação no aplicativo GRU."
        >{packageReady ? "Pacote pronto" : packaging ? "Preparando…" : "Preparar Android"}</button>
      </div>
    </div>
    {packageSuccessOpen && <PackageReadyDialog
      mascotCode={item.mascotCode}
      closeRef={closeSuccessRef}
      onClose={() => setPackageSuccessOpen(false)}
      onCopy={() => void copyCode()}
    />}
    {posesOpen && <MascotPosesDialog displayName={item.displayName} poses={item.poses} closeRef={closePosesRef} onClose={() => setPosesOpen(false)} />}
    {deleteDialogOpen && <MascotDeleteDialog displayName={item.displayName} saving={saving} onClose={() => setDeleteDialogOpen(false)} onDelete={deleteMascot} />}
  </article>;
}

function StarIcon({ filled }: { filled: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m12 3 2.78 5.63 6.22.9-4.5 4.38 1.06 6.19L12 17.18 6.44 20.1 7.5 13.91 3 9.53l6.22-.9L12 3Z" /></svg>;
}

function PencilIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path strokeLinecap="round" strokeLinejoin="round" d="m4 16.7-.7 4 4-.7L19 8.3 15.7 5 4 16.7Z" /><path strokeLinecap="round" d="m14.8 5.9 3.3 3.3" /></svg>;
}

function MoreIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>;
}

function PackageReadyDialog({ mascotCode, closeRef, onClose, onCopy }: {
  mascotCode: string;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onCopy: () => void;
}) {
  return createPortal(<div className="package-success-dialog__backdrop" role="presentation">
    <section className="package-success-dialog" role="dialog" aria-modal="true" aria-labelledby="package-success-title" aria-describedby="package-success-description">
      <span className="package-success-dialog__seal" aria-hidden="true">✓</span>
      <p className="package-success-dialog__kicker">Pacote pronto</p>
      <h2 id="package-success-title">Seu mascote já pode viajar.</h2>
      <p id="package-success-description">As três poses foram preparadas e conferidas. Cole este código no app GRU para trazê-lo ao celular.</p>
      <strong className="package-success-dialog__code">{mascotCode}</strong>
      <div className="package-success-dialog__actions">
        <button type="button" onClick={onCopy}>Copiar código</button>
        <button ref={closeRef} type="button" onClick={onClose}>Continuar</button>
      </div>
    </section>
  </div>, document.body);
}

function MascotPosesDialog({ displayName, poses, closeRef, onClose }: {
  displayName: string;
  poses: MascotLibraryItem["poses"];
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  useEffect(() => {
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeRef, onClose]);

  return createPortal(<div className="package-success-dialog__backdrop" role="presentation" onMouseDown={onClose}>
    <section className="mascot-poses-dialog" role="dialog" aria-modal="true" aria-labelledby="mascot-poses-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="mascot-poses-dialog__heading"><div><p>Conjunto completo</p><h2 id="mascot-poses-title">{displayName}</h2></div><button ref={closeRef} type="button" onClick={onClose}>Fechar</button></div>
      <div className="mascot-poses-dialog__grid">{poses.map((pose) => <figure key={pose.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pose.imageUrl} alt={`${pose.label} de ${displayName}.`} />
        <figcaption>{pose.label}</figcaption>
      </figure>)}</div>
    </section>
  </div>, document.body);
}

function MascotDeleteDialog({ displayName, saving, onClose, onDelete }: { displayName: string; saving: boolean; onClose: () => void; onDelete: () => void }) {
  return createPortal(<div className="package-success-dialog__backdrop" role="presentation">
    <section className="package-success-dialog" role="dialog" aria-modal="true" aria-labelledby="mascot-delete-title">
      <p className="package-success-dialog__kicker">Excluir mascote</p><h2 id="mascot-delete-title">Excluir {displayName}?</h2>
      <p>Ele sairá da sua biblioteca e o código deixará de funcionar. A cópia já instalada no GRU não será apagada do celular.</p>
      <div className="package-success-dialog__actions"><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="library-dialog__danger" disabled={saving} onClick={onDelete}>Excluir agora</button></div>
    </section>
  </div>, document.body);
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
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    if (a.isFavorite && b.isFavorite && a.favoriteRank !== b.favoriteRank) return (a.favoriteRank ?? Number.MAX_SAFE_INTEGER) - (b.favoriteRank ?? Number.MAX_SAFE_INTEGER);
    if (sort === "code") return a.mascotCode.localeCompare(b.mascotCode, "pt-BR");
    const newestFirst = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sort === "newest" ? newestFirst : -newestFirst;
  });
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
