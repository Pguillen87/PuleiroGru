"use client";

import { useState } from "react";
import { PuleiroWordmark } from "@/components/brand/PuleiroWordmark";

type HeaderProps = { onUnavailableNavigation: (destination: string) => void };

const destinations = ["Explorar", "Meus mascotes"] as const;

export function Header({ onUnavailableNavigation }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const destinationLinks = destinations.map((destination) => (
    <a
      key={destination}
      href="#puleiro-stage"
      onClick={() => {
        setMenuOpen(false);
        onUnavailableNavigation(destination);
      }}
    >
      {destination}
    </a>
  ));

  return (
    <header className="site-header">
      <PuleiroWordmark />
      <nav className="desktop-navigation" aria-label="Navegação principal">
        {destinationLinks}
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
      </nav>
    </header>
  );
}
