"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PuleiroWordmark } from "@/components/brand/PuleiroWordmark";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { clearSessionPreference, defaultPersistentSessionPreference, shouldEndSessionAfterBrowserClose } from "@/lib/auth/session-preference";

type HeaderProps = { onUnavailableNavigation?: (destination: string) => void };

const destinations = [
  { label: "Criar", href: "/criar" },
  { label: "Explorar", href: "/explorar" },
  { label: "Meus mascotes", href: "/meus-mascotes" },
] as const;

export function Header({ onUnavailableNavigation }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => configured ? createClient() : null, [configured]);
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active) return;
      if (!error && data.user && shouldEndSessionAfterBrowserClose()) {
        await supabase.auth.signOut();
        if (active) setSignedIn(false);
        return;
      }
      if (!error && data.user) defaultPersistentSessionPreference();
      setSignedIn(!error && Boolean(data.user));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session?.user));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    clearSessionPreference();
    setMenuOpen(false);
    setSignedIn(false);
    router.push("/");
    router.refresh();
  }

  const destinationLinks = destinations.map((destination) => (
    <a
      key={destination.label}
      href={destination.href}
      onClick={() => {
        setMenuOpen(false);
        onUnavailableNavigation?.(destination.label);
      }}
    >
      {destination.label}
    </a>
  ));

  return (
    <header className="site-header">
      <PuleiroWordmark />
      <nav className="desktop-navigation" aria-label="Navegação principal">
        {destinationLinks}
        {signedIn && <button type="button" onClick={() => void signOut()}>Sair</button>}
      </nav>
      <button
        className="menu-trigger"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="mobile-navigation"
        aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      <nav
        id="mobile-navigation"
        className="mobile-navigation"
        aria-label="Navegação principal"
        hidden={!menuOpen}
      >
        {destinationLinks}
        {signedIn && <button type="button" onClick={() => void signOut()}>Sair</button>}
      </nav>
    </header>
  );
}
