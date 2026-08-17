import Link from "next/link";

export function PuleiroWordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="Voltar à tela principal do Puleiro do GRU">
      Puleiro <span>do GRU</span>
    </Link>
  );
}
