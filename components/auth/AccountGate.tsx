"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StageButton } from "@/components/actions/StageButton";
import { PuleiroWordmark } from "@/components/brand/PuleiroWordmark";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type AccountMode = "login" | "signup" | "recovery";
type GateStatus = "checking" | "signed-out" | "signed-in";
export function AccountGate({ required, children }: { required: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const supabase = useMemo(
    () => (required && configured ? createClient() : null),
    [configured, required],
  );
  const [status, setStatus] = useState<GateStatus>(
    required && configured ? "checking" : required ? "signed-out" : "signed-in",
  );
  const [message, setMessage] = useState(
    configured
      ? "Confirmando sua entrada no Puleiro…"
      : "A entrada protegida ainda não foi configurada.",
  );

  useEffect(() => {
    if (!required || !supabase) return;

    let active = true;
    void supabase.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (!active) return;
        setStatus(!error && data.user ? "signed-in" : "signed-out");
        setMessage(
          !error && data.user
            ? "Entrada confirmada."
            : callbackMessage() ?? "Entre para preservar este nascimento com segurança.",
        );
      })
      .catch(() => {
        if (!active) return;
        setStatus("signed-out");
        setMessage("Não foi possível confirmar sua sessão. Entre novamente para continuar.");
      });

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        setStatus("signed-out");
        setMessage("Você saiu do Puleiro. Entre novamente para retomar.");
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") setStatus("signed-in");
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [required, supabase]);

  useEffect(() => {
    if (!required) return;
    const requireAuthentication = () => {
      setStatus("signed-out");
      setMessage("Sua sessão terminou. Entre novamente para continuar.");
    };
    window.addEventListener("puleiro:auth-required", requireAuthentication);
    return () => window.removeEventListener("puleiro:auth-required", requireAuthentication);
  }, [required]);

  useEffect(() => {
    if (!required) return;
    const handleSignedOut = () => {
      setStatus("signed-out");
      setMessage("Você saiu do Puleiro. Entre novamente para continuar.");
    };
    window.addEventListener("puleiro:auth-signed-out", handleSignedOut);
    return () => window.removeEventListener("puleiro:auth-signed-out", handleSignedOut);
  }, [required]);

  if (status === "checking") return <AccountStatus message={message} />;
  if (status === "signed-out" && !configured) return <AccountStatus message={message} />;
  if (status === "signed-out") {
    return <AccountForm
      initialMessage={message}
      onSignedIn={() => {
        setStatus("signed-in");
        router.refresh();
      }}
    />;
  }
  return children;
}

function AccountStatus({ message }: { message: string }) {
  return (
    <main className="account-gate">
      <span className="account-gate__scene" aria-hidden="true" />
      <div className="account-gate__content">
        <PuleiroWordmark />
        <p className="editorial-kicker">Entrada protegida</p>
        <h1>Seu lugar no Puleiro</h1>
        <p role="status" aria-live="polite">{message}</p>
      </div>
    </main>
  );
}

function AccountForm({ initialMessage, onSignedIn }: { initialMessage: string; onSignedIn: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<AccountMode>("login");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(initialMessage);
  const titleRef = useRef<HTMLHeadingElement>(null);

  function switchMode(nextMode: AccountMode) {
    setMode(nextMode);
    setFeedback(modeInstruction(nextMode));
    window.requestAnimationFrame(() => titleRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    setBusy(true);
    setFeedback(mode === "recovery" ? "Preparando as instruções…" : "Abrindo o portão…");
    try {
      if (mode === "recovery") return await recover(email);
      if (mode === "signup") return await signUp(email, password);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setFeedback("Entrada confirmada.");
      onSignedIn();
    } catch (error) {
      setFeedback(authenticationFailureMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (error) throw error;
    if (data.session) {
      onSignedIn();
      return;
    }
    switchMode("login");
    setFeedback("Confira seu e-mail para confirmar a conta. Depois, entre para continuar.");
  }

  async function recover(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/update-password`,
    });
    if (error) throw error;
    switchMode("login");
    setFeedback("Enviamos as instruções de recuperação para o seu e-mail.");
  }

  const title = mode === "login" ? "Entre no Puleiro" : mode === "signup" ? "Guarde seu lugar" : "Recupere sua entrada";
  return (
    <main className="account-gate">
      <span className="account-gate__scene" aria-hidden="true" />
      <div className="account-gate__content">
        <PuleiroWordmark />
        <p className="editorial-kicker">Entrada protegida</p>
        <h1 ref={titleRef} tabIndex={-1}>{title}</h1>
        <p>{modeInstruction(mode)}</p>
        <form onSubmit={submit}>
          <label htmlFor="puleiro-email">E-mail</label>
          <input id="puleiro-email" name="email" type="email" autoComplete="username" autoFocus required />
          {mode !== "recovery" && <>
            <label htmlFor="puleiro-password">Senha</label>
            <input id="puleiro-password" name="password" type="password" minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
            {mode === "signup" && <p className="account-gate__availability">Use pelo menos 6 caracteres.</p>}
          </>}
          <StageButton type="submit" disabled={busy}>{busy ? "Aguarde…" : actionLabel(mode)}</StageButton>
        </form>
        <p className="account-gate__session-note">O Puleiro não salva sua senha. Para preencher a senha automaticamente, use o gerenciador de senhas do navegador. No ambiente de teste, mantenha sempre o mesmo endereço Preview para continuar conectado.</p>
        <p role="status" aria-live="polite" aria-atomic="true">{feedback}</p>
        <div className="account-gate__switches" role="group" aria-label="Opções de acesso">
          {mode !== "login" && <button type="button" onClick={() => switchMode("login")}>Já tenho conta</button>}
          {mode !== "signup" && <button type="button" onClick={() => switchMode("signup")}>Criar uma conta</button>}
          {mode !== "recovery" && <button type="button" onClick={() => switchMode("recovery")}>Esqueci minha senha</button>}
        </div>
      </div>
    </main>
  );
}

function callbackMessage() {
  const reason = new URLSearchParams(window.location.search).get("auth");
  if (reason === "expired") return "O link expirou. Solicite novas instruções para continuar.";
  if (reason === "invalid") return "Não foi possível validar esse link. Solicite novas instruções.";
  return null;
}

function modeInstruction(mode: AccountMode) {
  return mode === "recovery"
    ? "Informe seu e-mail para receber as instruções."
    : "Sua conta permite retomar este nascimento em outro aparelho.";
}

function actionLabel(mode: AccountMode) {
  if (mode === "signup") return "Criar conta";
  if (mode === "recovery") return "Enviar instruções";
  return "Entrar";
}

function authenticationFailureMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "invalid_credentials" || code === "email_not_confirmed") return "Não foi possível entrar. Confira seus dados e a confirmação do e-mail.";
  if (code === "user_already_exists" || code === "user_already_registered") return "Não foi possível criar a conta com esses dados.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Muitas tentativas em pouco tempo. Aguarde alguns minutos.";
  return "A entrada está temporariamente indisponível. Tente novamente em instantes.";
}
