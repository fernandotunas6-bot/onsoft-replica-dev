import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Eye,
  EyeOff,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensureDevBypassSession } from "@/features/auth/dev-bypass.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AuthSessionContext = createContext<Session | null>(null);
const IDLE_TIMEOUT_MS = 30 * 60_000;
const ACTIVITY_WRITE_INTERVAL_MS = 15_000;
const AUTH_DISABLED = import.meta.env["VITE_AUTH_DISABLED"] === "true";
const REMEMBERED_EMAIL_KEY = "siga:login-email";

const activityKey = (userId: string) => `siga:last-activity:${userId}`;

function mapSignInError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login credentials") || value.includes("invalid_credentials")) {
    return "Email ou senha incorrectos. Confirme os dados e tente novamente.";
  }
  if (value.includes("email not confirmed")) {
    return "Confirme o email da conta antes de iniciar sessão.";
  }
  if (value.includes("too many requests") || value.includes("rate limit")) {
    return "Demasiadas tentativas. Aguarde um momento e tente outra vez.";
  }
  if (value.includes("network") || value.includes("fetch")) {
    return "Não foi possível contactar o serviço de autenticação.";
  }
  return "Não foi possível iniciar sessão. Tente novamente.";
}

export function useAuthSession(): Session | null {
  return useContext(AuthSessionContext);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    try {
      setRememberedEmail(localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "");
    } catch {
      setRememberedEmail("");
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          setSession(data.session);
          setChecking(false);
          return;
        }

        if (AUTH_DISABLED) {
          const tokens = await ensureDevBypassSession();
          if (!active) return;
          const { data: setData, error: setError } = await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          });
          if (setError) throw setError;
          if (setData.session) {
            localStorage.setItem(activityKey(setData.session.user.id), String(Date.now()));
            setSession(setData.session);
          }
          setChecking(false);
          return;
        }

        setSession(null);
        setChecking(false);
      } catch (bootstrapError) {
        if (!active) return;
        setError(
          bootstrapError instanceof Error
            ? bootstrapError.message
            : "Não foi possível iniciar o serviço de autenticação.",
        );
        setChecking(false);
      }
    };

    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "SIGNED_IN" && nextSession) {
        localStorage.setItem(activityKey(nextSession.user.id), String(Date.now()));
      }
      setSession(nextSession);
      setChecking(false);
      setSubmitting(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || AUTH_DISABLED) return;

    const key = activityKey(session.user.id);
    let lastWrite = 0;
    let expiring = false;

    const markActivity = () => {
      if (expiring) return;
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_WRITE_INTERVAL_MS) return;
      lastWrite = now;
      localStorage.setItem(key, String(now));
    };

    const expireSession = async () => {
      if (expiring) return;
      expiring = true;
      setSession(null);
      setError("A sessão terminou após 30 minutos sem actividade. Entre novamente.");
      await supabase.auth.signOut({ scope: "local" });
    };

    const checkActivity = () => {
      const stored = Number(localStorage.getItem(key));
      if (!Number.isFinite(stored) || stored <= 0) {
        markActivity();
        return;
      }
      if (Date.now() - stored >= IDLE_TIMEOUT_MS) void expireSession();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkActivity();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === key && event.newValue) checkActivity();
    };
    const activityEvents: Array<keyof WindowEventMap> = ["keydown", "pointerdown", "touchstart"];

    checkActivity();
    for (const event of activityEvents) {
      window.addEventListener(event, markActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onStorage);
    const interval = window.setInterval(checkActivity, ACTIVITY_WRITE_INTERVAL_MS);

    return () => {
      for (const event of activityEvents) window.removeEventListener(event, markActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, [session]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const remember = String(form.get("remember") ?? "") === "on";
    try {
      if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      else localStorage.removeItem(REMEMBERED_EMAIL_KEY);

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!signInError) {
        if (data.user) localStorage.setItem(activityKey(data.user.id), String(Date.now()));
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.data?.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2") {
          const factors = await supabase.auth.mfa.listFactors();
          const totp = factors.data?.totp[0];
          if (totp) {
            setMfaFactorId(totp.id);
            setSession(null);
            return;
          }
        }
        return;
      }
      setError(mapSignInError(signInError.message));
    } catch {
      setError("Não foi possível contactar o serviço de autenticação.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    const emailInput = document.getElementById("login-email") as HTMLInputElement | null;
    const email = (emailInput?.value ?? rememberedEmail).trim().toLowerCase();
    if (!email) {
      setError("Indique o email da conta para recuperar a senha.");
      return;
    }
    setResetting(true);
    setError(null);
    setInfo(null);
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/alterar-senha` : undefined;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        ...(redirectTo ? { redirectTo } : {}),
      });
      if (resetError) {
        setError(mapSignInError(resetError.message));
        return;
      }
      setInfo("Se a conta existir, enviámos um link de recuperação para o email indicado.");
    } catch {
      setError("Não foi possível pedir a recuperação de senha.");
    } finally {
      setResetting(false);
    }
  };

  if (checking) {
    return (
      <AuthSessionContext.Provider value={session}>
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,var(--primary-soft),transparent_45%),linear-gradient(180deg,var(--background),var(--secondary)/40)]">
          <LoaderCircle
            className="size-7 animate-spin text-primary"
            aria-label="A verificar sessão"
          />
        </div>
      </AuthSessionContext.Provider>
    );
  }

  if (session) {
    return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
  }

  return (
    <AuthSessionContext.Provider value={null}>
      <main className="grid min-h-screen bg-background lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative hidden overflow-hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.28), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.18), transparent 35%)",
            }}
          />
          <div className="relative flex items-center gap-3 text-xl font-extrabold">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary-foreground/15">
              <GraduationCap className="size-6" />
            </span>
            SIGA
          </div>
          <div className="relative max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-75">
              Gestão escolar segura
            </p>
            <h1 className="mt-4 font-display text-5xl font-extrabold leading-tight">
              A escola inteira, pronta ao toque.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 opacity-80">
              Pessoas, alunos, turmas, documentos, finanças e relatórios numa experiência rápida,
              auditável e protegida por perfil.
            </p>
          </div>
          <div className="relative flex items-center gap-2 text-sm opacity-80">
            <ShieldCheck className="size-5" /> Sessão protegida pelo Supabase Auth
          </div>
        </section>

        <section className="flex items-center justify-center bg-[radial-gradient(circle_at_top,var(--primary-soft),transparent_50%)] px-5 py-10 sm:px-10">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card/95 p-7 shadow-xl backdrop-blur sm:p-9">
            <div className="mb-8 lg:hidden">
              <span className="inline-flex items-center gap-2 font-display text-xl font-extrabold">
                <GraduationCap className="size-6 text-primary" /> SIGA
              </span>
            </div>
            <p className="text-sm font-semibold text-primary">Bem-vindo</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
              Iniciar sessão
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use a conta institucional fornecida pela administração da escola.
            </p>

            {AUTH_DISABLED ? (
              <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                Modo demo activo (`VITE_AUTH_DISABLED`). Desactive no `.env` para login real.
              </p>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            {info ? (
              <p
                role="status"
                className="mt-4 rounded-xl bg-success/10 px-3 py-2 text-sm text-success"
              >
                {info}
              </p>
            ) : null}

            {mfaFactorId ? (
              <form
                className="mt-8 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void (async () => {
                    setSubmitting(true);
                    setError(null);
                    try {
                      const challenge = await supabase.auth.mfa.challenge({
                        factorId: mfaFactorId,
                      });
                      if (challenge.error) throw challenge.error;
                      const verified = await supabase.auth.mfa.verify({
                        factorId: mfaFactorId,
                        challengeId: challenge.data.id,
                        code: mfaCode.trim(),
                      });
                      if (verified.error) throw verified.error;
                      setMfaFactorId(null);
                      setMfaCode("");
                    } catch (verifyError) {
                      setError(
                        verifyError instanceof Error ? verifyError.message : "Código 2FA inválido.",
                      );
                    } finally {
                      setSubmitting(false);
                    }
                  })();
                }}
              >
                <p className="text-sm text-muted-foreground">
                  Introduza o código da aplicação autenticadora para concluir o início de sessão.
                </p>
                <Input
                  aria-label="Código de autenticação multifator"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  required
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || mfaCode.length < 6}
                >
                  {submitting ? "A verificar…" : "Confirmar 2FA"}
                </Button>
              </form>
            ) : null}

            <form
              className="mt-8 space-y-5"
              onSubmit={signIn}
              aria-busy={submitting}
              hidden={Boolean(mfaFactorId)}
            >
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    defaultValue={rememberedEmail}
                    className="pl-9"
                    placeholder="nome@escola.org"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="login-password">Senha</Label>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                    onClick={() => void resetPassword()}
                    disabled={resetting || submitting}
                  >
                    {resetting ? "A enviar…" : "Esqueci a senha"}
                  </button>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    className="pr-11 pl-9"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  name="remember"
                  aria-label="Lembrar email"
                  defaultChecked={Boolean(rememberedEmail)}
                  className="size-4 rounded border-input"
                />
                Memorizar email neste dispositivo
              </label>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <LockKeyhole className="size-4" />
                )}
                {submitting ? "A entrar…" : "Entrar"}
              </Button>
            </form>
          </div>
        </section>
      </main>
    </AuthSessionContext.Provider>
  );
}
