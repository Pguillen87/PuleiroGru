"use client";

import { useState } from "react";
import { PuleiroWordmark } from "@/components/brand/PuleiroWordmark";
import { usePuleiroAuth } from "@/components/auth/AccountGate";

type HeaderProps = { onUnavailableNavigation?: (destination: string) => void };

const destinations = [
  { label: "Explorar", href: "/" },
  { label: "Meus mascotes", href: "/meus-mascotes" },
] as const;

export function Header({ onUnavailableNavigation }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { signOut } = usePuleiroAuth();

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
        {signOut && <button type="button" onClick={signOut}>Sair</button>}
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
        {signOut && <button type="button" onClick={signOut}>Sair</button>}
      </nav>
    </header>
  );
}
