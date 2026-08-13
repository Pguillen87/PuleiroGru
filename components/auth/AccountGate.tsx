"use client";

import { FormEvent, useEffect, useState } from "react";
import { StageButton } from "@/components/actions/StageButton";
import { PuleiroWordmark } from "@/components/brand/PuleiroWordmark";

type AccountGateProps = {
  required: boolean;
  children: React.ReactNode;
};

export function AccountGate({ required, children }: AccountGateProps) {
  const [status, setStatus] = useState<"checking" | "signed-out" | "signed-in">(required ? "checking" : "signed-in");
  const [message, setMessage] = useState("Confirmando sua entrada no Puleiro…");

  useEffect(() => {
    if (!required) return;
    let active = true;
    void import("@/lib/auth/firebase-client").then(({ refreshBrowserSession }) => refreshBrowserSession())
      .then((user) => {
        if (!active) return;
        setStatus(user ? "signed-in" : "signed-out");
        setMessage(user ? "Entrada confirmada." : "Entre para preservar seu nascimento com segurança.");
      })
      .catch(() => {
        if (!active) return;
        setStatus("signed-out");
        setMessage("Não foi possível confirmar sua entrada. Tente novamente.");
      });
    return () => { active = false; };
  }, [required]);

  if (status === "signed-in") return children;
  if (status === "checking") return <AccountStatus message={message} />;
  return <AccountForm message={message} onSignedIn={() => setStatus("signed-in")} />;
}

function AccountStatus({ message }: { message: string }) {
  return (
    <main className="account-gate">
      <PuleiroWordmark />
      <p className="editorial-kicker">Entrada protegida</p>
      <h1>Seu lugar no Puleiro</h1>
      <p role="status" aria-live="polite">{message}</p>
    </main>
  );
}

function AccountForm({ message, onSignedIn }: { message: string; onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(message);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback("Abrindo o portão…");
    try {
      const { signInAndCreateSession } = await import("@/lib/auth/firebase-client");
      await signInAndCreateSession(String(data.get("email")), String(data.get("password")));
      onSignedIn();
    } catch {
      setFeedback("Não conseguimos confirmar sua entrada. Confira os dados e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-gate">
      <PuleiroWordmark />
      <p className="editorial-kicker">Entrada protegida</p>
      <h1>Entre no Puleiro</h1>
      <p>Use sua conta para retomar este nascimento em outro aparelho.</p>
      <form onSubmit={submit}>
        <label htmlFor="puleiro-email">E-mail</label>
        <input id="puleiro-email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="puleiro-password">Senha</label>
        <input id="puleiro-password" name="password" type="password" autoComplete="current-password" required />
        <StageButton type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</StageButton>
      </form>
      <p role="status" aria-live="polite" aria-atomic="true">{feedback}</p>
    </main>
  );
}
