"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StageButton } from "@/components/actions/StageButton";
import { PuleiroWordmark } from "@/components/brand/PuleiroWordmark";
import { createClient } from "@/lib/supabase/client";

export function PasswordUpdateForm() {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useState("Escolha uma nova senha com pelo menos oito caracteres.");
  const returnRef = useRef<HTMLAnchorElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("password-confirmation") ?? "");
    if (password !== confirmation) {
      setMessage("As senhas precisam ser iguais.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setCompleted(true);
      setMessage("Senha atualizada. Você já pode voltar ao Puleiro.");
      window.requestAnimationFrame(() => returnRef.current?.focus());
    } catch {
      setMessage("Não foi possível atualizar a senha. Solicite novas instruções.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-gate">
      <span className="account-gate__scene" aria-hidden="true" />
      <PuleiroWordmark />
      <p className="editorial-kicker">Entrada protegida</p>
      <h1>Crie uma nova senha</h1>
      {!completed && <form onSubmit={submit}>
        <label htmlFor="new-password">Nova senha</label>
        <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <label htmlFor="new-password-confirmation">Confirme a nova senha</label>
        <input id="new-password-confirmation" name="password-confirmation" type="password" autoComplete="new-password" minLength={8} required />
        <StageButton type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</StageButton>
      </form>}
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <Link ref={returnRef} className="account-gate__return" href="/">Voltar ao Puleiro</Link>
    </main>
  );
}
