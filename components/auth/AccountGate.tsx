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

  useEffect(() => {
    if (!required) return;
    const requireAuthentication = () => {
      setStatus("signed-out");
      setMessage("Sua sessão terminou. Entre novamente para retomar este nascimento.");
    };
    window.addEventListener("puleiro:auth-required", requireAuthentication);
    return () => window.removeEventListener("puleiro:auth-required", requireAuthentication);
  }, [required]);

  if (status === "signed-in") return children;
  if (status === "checking") return <AccountStatus message={message} />;
  return <AccountForm message={message} onSignedIn={() => setStatus("signed-in")} />;
}

function AccountStatus({ message }: { message: string }) {
  return (
    <main className="account-gate">
      <span className="account-gate__scene" aria-hidden="true" />
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
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("#puleiro-main-title")?.focus());
    } catch (error) {
      setFeedback(authenticationFailureMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-gate">
      <span className="account-gate__scene" aria-hidden="true" />
      <PuleiroWordmark />
      <p className="editorial-kicker">Entrada protegida</p>
      <h1>Entre no Puleiro</h1>
      <p>Use sua conta para retomar este nascimento em outro aparelho.</p>
      <form onSubmit={submit}>
        <label htmlFor="puleiro-email">E-mail</label>
        <input id="puleiro-email" name="email" type="email" autoComplete="email" autoFocus required />
        <label htmlFor="puleiro-password">Senha</label>
        <input id="puleiro-password" name="password" type="password" autoComplete="current-password" required />
        <StageButton type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</StageButton>
      </form>
      <p role="status" aria-live="polite" aria-atomic="true">{feedback}</p>
      <p className="account-gate__availability">Cadastro e recuperação de acesso serão definidos antes da abertura ao público.</p>
    </main>
  );
}

function authenticationFailureMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/invalid-credential") return "E-mail ou senha não conferem. Revise os dados e tente novamente.";
  if (code === "auth/network-request-failed") return "A conexão caiu antes de abrir o portão. Tente novamente quando ela voltar.";
  return "A entrada está temporariamente indisponível. Seus dados não foram enviados; tente novamente em instantes.";
}
