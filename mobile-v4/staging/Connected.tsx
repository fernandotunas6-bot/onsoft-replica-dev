import { useEffect, useMemo, useState } from "react";
import { App } from "../src/App";
import { createSigaMobileV4Gateway } from "../../src/features/mobile-v4/browser";
import { supabase } from "../../src/integrations/supabase/client";
import {
  listVerificationFactors,
  sessionAal,
  verifyWithCode,
  type VerificationFactors,
} from "../../src/features/auth/verification";
import { Icon } from "../src/components/Icon";

export function ConnectedMobile() {
  const gateway = useMemo(() => createSigaMobileV4Gateway(), []);
  const [mode, setMode] = useState("loading");
  const [factors, setFactors] = useState<VerificationFactors | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true,
      generation = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    async function sync() {
      const id = ++generation;
      try {
        const result = await supabase.auth.getSession();
        if (result.error) throw result.error;
        const session = result.data.session;
        let pending: VerificationFactors | null = null;
        if (session && sessionAal(session.access_token) !== "aal2") {
          const found = await listVerificationFactors();
          if (found.totpId || found.passkeyId) pending = found;
        }
        if (live && generation === id) {
          setFactors(pending);
          setMode(!session ? "login" : pending ? "mfa" : "ready");
        }
      } catch {
        if (live && generation === id) {
          setMode("login");
          setError("Não foi possível confirmar a sessão. Volta a entrar.");
        }
      }
    }
    void sync();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      generation++;
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") setMode("loading");
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (live) void sync();
      }, 0);
      timers.add(timer);
    });
    return () => {
      live = false;
      generation++;
      data.subscription.unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, []);
  if (mode === "ready") return <App initialGateway={gateway} />;
  async function submit() {
    setBusy(true);
    setError("");
    const credential = password;
    setPassword("");
    try {
      if (mode === "mfa") {
        if (!factors?.totpId) throw new Error("totp missing");
        await verifyWithCode(factors.totpId, code);
        setCode("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: credential,
        });
        if (error) throw error;
      }
    } catch {
      setError(
        mode === "mfa"
          ? "Código inválido ou expirado."
          : "Não foi possível entrar. Verifica o e-mail e a senha.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div id="app" className="gradient">
      <main className="content">
        <div className="brand-mark">S</div>
        <h1>SIGA Plus</h1>
        <p className="muted">Mobile V4 · ligação de testes ao Sga</p>
        <section className="card">
          {mode === "loading" ? (
            <p role="status">A confirmar sessão…</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <h2>{mode === "mfa" ? "Confirmar identidade" : "Entrar na conta escolar"}</h2>
              {mode === "mfa" ? (
                <>
                  <p>Usa o código da aplicação autenticadora já configurada no SIGA.</p>
                  <label>
                    Código de autenticação
                    <input
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    E-mail institucional
                    <input
                      required
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    Senha
                    <input
                      required
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                </>
              )}
              <button
                className="pill"
                disabled={busy || (mode === "mfa" && !factors?.totpId)}
                type="submit"
              >
                <Icon name="user-round" />
                {busy ? "A confirmar…" : mode === "mfa" ? "Confirmar código" : "Entrar"}
              </button>
              {mode === "mfa" && (
                <button
                  type="button"
                  className="pill"
                  disabled={busy}
                  onClick={() => {
                    setCode("");
                    void supabase.auth.signOut({ scope: "local" });
                  }}
                >
                  Sair desta conta
                </button>
              )}
              {mode === "mfa" && !factors?.totpId && (
                <p>
                  Esta conta usa uma chave ligada ao domínio do portal. Entra pelo domínio original;
                  não é possível usar essa chave neste preview.
                </p>
              )}
            </form>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
        <p className="small">Apenas consulta académica autorizada. Escritas ainda indisponíveis.</p>
      </main>
    </div>
  );
}
