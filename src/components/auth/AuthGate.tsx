import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ensureDevBypassSession } from "@/features/auth/dev-bypass.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoading } from "@/components/ui/page-loading";

const AuthSessionContext = createContext<Session | null>(null);
const IDLE_TIMEOUT_MS = 30 * 60_000;
const ACTIVITY_WRITE_INTERVAL_MS = 15_000;
const LOGIN_REQUIRED = true;
const AUTH_DISABLED = !LOGIN_REQUIRED && import.meta.env["VITE_AUTH_DISABLED"] === "true";
const REMEMBERED_EMAIL_KEY = "portal:login-email";

const activityKey = (userId: string) => `portal:last-activity:${userId}`;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

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
  const [sendingMagicLink, setSendingMagicLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    try {
      setRememberedEmail(localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "");
    } catch {
      setRememberedEmail("");
    }

    if (typeof window !== "undefined") {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(Boolean(isStandaloneMode));

      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setInstallPrompt(e as BeforeInstallPromptEvent);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstall);
      return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    }
    return undefined;
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
      }
    } catch (e) {
      console.warn("PWA install error:", e);
    }
  };

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
          try {
            const { data: adminLogin, error: autoLoginError } =
              await supabase.auth.signInWithPassword({
                email: "admin@escola.ao",
                password: "Admin@Escola2026!",
              });
            if (!autoLoginError && adminLogin?.session) {
              localStorage.setItem(activityKey(adminLogin.session.user.id), String(Date.now()));
              setSession(adminLogin.session);
              setChecking(false);
              return;
            }
          } catch {
            // fallback to dev bypass tokens
          }

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
      // Uma conta sem vínculo escolar (ex.: primeiro login Google) entra na
      // sessão mas não vê dados de escola nenhuma: o RouteAccessGate mostra-lhe
      // o painel de integração institucional, e o servidor recusa tudo o que
      // exija membership. A identidade prova QUEM é; só um vínculo aprovado
      // decide O QUE pode ver.
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

  const performSignIn = async (
    inputIdentifier: string,
    password: string,
    options?: { remember?: boolean },
  ) => {
    setSubmitting(true);
    setError(null);
    setInfo(null);
    let email = inputIdentifier.trim().toLowerCase();
    try {
      if (!email.includes("@") && email.length >= 3) {
        const { resolveBiToEmailFn } = await import("@/features/access/server");
        const resolved = await resolveBiToEmailFn({ data: { identifier: inputIdentifier.trim() } });
        email = resolved.email;
      }

      if (options?.remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, inputIdentifier.trim());
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

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const inputIdentifier = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const remember = String(form.get("remember") ?? "") === "on";
    await performSignIn(inputIdentifier, password, { remember });
  };

  const resetPassword = async () => {
    const emailInput = document.getElementById("login-email") as HTMLInputElement | null;
    const email = (emailInput?.value ?? rememberedEmail).trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Indique um endereço de email válido para recuperar a senha.");
      return;
    }
    setResetting(true);
    setError(null);
    setInfo(null);
    try {
      const hostname = typeof window !== "undefined" ? window.location.hostname : undefined;
      const { requestPasswordResetFn } = await import("@/features/auth/reset-password-server");
      const result = await requestPasswordResetFn({ data: { email, hostname } });
      setInfo(result.message);
    } catch {
      setInfo(
        "Se existir uma conta associada a este endereço, enviámos as instruções de recuperação.",
      );
    } finally {
      setResetting(false);
    }
  };

  const sendMagicLink = async () => {
    const emailInput = document.getElementById("login-email") as HTMLInputElement | null;
    const email = (emailInput?.value ?? rememberedEmail).trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Indique um endereço de email válido para entrar sem senha.");
      return;
    }
    setSendingMagicLink(true);
    setError(null);
    setInfo(null);
    try {
      const hostname = typeof window !== "undefined" ? window.location.hostname : undefined;
      const { requestMagicLinkFn } = await import("@/features/auth/magic-link-server");
      const result = await requestMagicLinkFn({ data: { email, hostname } });
      setInfo(result.message);
    } catch {
      setInfo("Se existir uma conta associada a este endereço, enviámos um link de acesso.");
    } finally {
      setSendingMagicLink(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setInfo(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (oauthError) {
      setError("Não foi possível iniciar sessão com o Google. Tente novamente.");
    }
    // Em sucesso, o browser navega para o Google — nada mais a fazer aqui.
  };

  /**
   * Criação de conta pela primeira vez. Cria só a identidade (auth.users) —
   * nenhum vínculo escolar. O e-mail tem de ser confirmado antes do primeiro
   * login, e é isso que permite ao Supabase ligar, mais tarde, a mesma pessoa
   * pelo Google sem duplicar a conta (só liga identidades com e-mail
   * verificado). A resposta é igual exista ou não o e-mail, para não revelar
   * contas registadas.
   */
  const signUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirmPassword") ?? "");
    setError(null);
    setInfo(null);
    if (fullName.length < 3) return setError("Indique o nome completo.");
    if (!email.includes("@")) return setError("Indique um endereço de e-mail válido.");
    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");

    setSubmitting(true);
    try {
      // Preferência: e-mail do SIGA via Resend (como recuperação e link mágico).
      const { requestSignupFn } = await import("@/features/auth/signup-server");
      const viaSiga = await requestSignupFn({ data: { fullName, email, password } });
      if (viaSiga.handled) {
        setMode("signin");
        setInfo(viaSiga.message);
        return;
      }
      // Sem Resend configurado: mailer nativo do Supabase ("Confirm signup").
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (signUpError) {
        setError(
          /password/i.test(signUpError.message)
            ? "A senha não cumpre a política de segurança. Use uma senha mais forte."
            : mapSignInError(signUpError.message),
        );
        return;
      }
      // Com confirmação de e-mail activa não há sessão: a pessoa confirma e entra.
      if (!data.session) {
        setMode("signin");
        setInfo(
          "Se este e-mail ainda não tiver conta, enviámos um link de confirmação. Confirme-o e depois inicie sessão.",
        );
      }
    } catch (signUpFailure) {
      setError(
        signUpFailure instanceof Error && signUpFailure.message
          ? signUpFailure.message
          : "Não foi possível contactar o serviço de autenticação.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <AuthSessionContext.Provider value={session}>
        <PageLoading message="A verificar sessão…" />
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
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25), transparent 45%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.15), transparent 40%)",
            }}
          />
          <div />
          <div className="relative max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
              Sistema Integrado de Gestão
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight">
              A instituição em pleno controlo operacional.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 opacity-85">
              Secretaria académica, estudantes, turmas, contabilidade, propinas e relatórios
              integrados com segurança e rapidez.
            </p>
          </div>
          <div className="relative flex items-center justify-between text-xs opacity-80">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> Autenticação Segura
            </div>
            {isStandalone && (
              <div className="flex items-center gap-1.5 rounded-md bg-primary-foreground/15 px-2.5 py-1 text-xs">
                <Smartphone className="size-3.5" /> PWA Ativo
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col items-center justify-center bg-muted/20 px-5 py-10 sm:px-10">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-sm sm:p-9">
            {installPrompt && (
              <div className="mb-6 flex flex-col items-center justify-center text-center pb-4 border-b border-border">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleInstallApp}
                  className="h-8 gap-1.5 text-xs rounded-full"
                >
                  <Download className="size-3.5" /> Instalar App SIGA Plus
                </Button>
              </div>
            )}

            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-center">
              {mode === "signup" ? "Criar conta SIGA Plus" : "Iniciar sessão"}
            </h2>
            <p className="mt-1.5 text-xs text-muted-foreground text-center">
              {mode === "signup"
                ? "Uma só identidade para todas as escolas a que pertencer."
                : "Entre com Google, e-mail ou Nº de BI."}
            </p>
            <div
              role="tablist"
              aria-label="Modo de acesso"
              className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-xs font-semibold"
              hidden={Boolean(mfaFactorId)}
            >
              {(
                [
                  ["signin", "Já tenho conta"],
                  ["signup", "Criar conta"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => {
                    setMode(value);
                    setError(null);
                    setInfo(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    mode === value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            ) : null}
            {info ? (
              <p
                role="status"
                className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-xs text-success"
              >
                {info}
              </p>
            ) : null}

            {mfaFactorId ? (
              <form
                className="mt-6 space-y-4"
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

                      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
                      if (assurance.error) throw assurance.error;
                      if (assurance.data?.currentLevel !== "aal2") {
                        throw new Error(
                          "A verificação 2FA não elevou a sessão para AAL2. Tente novamente.",
                        );
                      }

                      const { data: sessionData, error: sessionError } =
                        await supabase.auth.getSession();
                      if (sessionError) throw sessionError;
                      if (!sessionData.session) {
                        throw new Error("A sessão não ficou disponível após a verificação 2FA.");
                      }

                      localStorage.setItem(
                        activityKey(sessionData.session.user.id),
                        String(Date.now()),
                      );
                      setSession(sessionData.session);
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
                <p className="text-xs text-muted-foreground">
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
              className="mt-6 space-y-4"
              onSubmit={signIn}
              aria-busy={submitting}
              hidden={Boolean(mfaFactorId) || mode === "signup"}
            >
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-xs font-medium">
                  Email ou Nº de BI / NIF
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    name="email"
                    type="text"
                    autoComplete="username"
                    required
                    defaultValue={rememberedEmail}
                    className="pl-9 h-10 text-sm"
                    placeholder="utilizador@escola.ao ou 004212984LA042"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="login-password" className="text-xs font-medium">
                    Senha
                  </Label>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                    onClick={() => void resetPassword()}
                    disabled={resetting || submitting || sendingMagicLink}
                  >
                    {resetting ? "A enviar…" : "Esqueceu a senha?"}
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
                    className="pr-11 pl-9 h-10 text-sm"
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
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="remember"
                  aria-label="Lembrar email"
                  defaultChecked={Boolean(rememberedEmail)}
                  className="size-3.5 rounded border-input text-primary focus:ring-primary"
                />
                Lembrar email neste dispositivo
              </label>
              <Button
                type="submit"
                className="w-full gap-2 h-10 text-sm font-semibold"
                disabled={submitting || resetting || sendingMagicLink}
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <LockKeyhole className="size-4" />
                )}
                {submitting ? "A entrar…" : "Entrar no Portal"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
                onClick={() => void sendMagicLink()}
                disabled={sendingMagicLink || submitting || resetting}
              >
                {sendingMagicLink ? "A enviar link…" : "Ou entrar sem senha por link de e-mail"}
              </button>
            </form>

            {mode === "signup" && !mfaFactorId ? (
              <form className="mt-6 space-y-4" onSubmit={signUp} aria-busy={submitting}>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-xs font-medium">
                    Nome completo
                  </Label>
                  <Input
                    id="signup-name"
                    name="fullName"
                    autoComplete="name"
                    required
                    minLength={3}
                    maxLength={160}
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-xs font-medium">
                    E-mail
                  </Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="h-10 text-sm"
                    placeholder="nome@exemplo.ao"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className="text-xs font-medium">
                      Senha
                    </Label>
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      className="h-10 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-confirm" className="text-xs font-medium">
                      Confirmar senha
                    </Label>
                    <Input
                      id="signup-confirm"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Criar conta não dá acesso a nenhuma escola. Depois de entrar, poderá configurar a
                  sua escola ou pedir acesso à secretaria da escola a que pertence.
                </p>
                <Button
                  type="submit"
                  className="w-full gap-2 h-10 text-sm font-semibold"
                  disabled={submitting}
                >
                  {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  {submitting ? "A criar conta…" : "Criar conta"}
                </Button>
              </form>
            ) : null}

            <div className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full gap-2 h-10 text-sm font-medium"
              onClick={() => void signInWithGoogle()}
              disabled={submitting || resetting || sendingMagicLink}
            >
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3a7.4 7.4 0 0 1-4.07 1.16c-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.27a12 12 0 0 0 0 10.8l4-3.11Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.6l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
                />
              </svg>
              {mode === "signup" ? "Continuar com Google" : "Entrar com Google"}
            </Button>

            {installPrompt && (
              <div className="mt-4 pt-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleInstallApp}
                  className="w-full gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Download className="size-3.5" />
                  Instalar aplicação Web no dispositivo (PWA)
                </Button>
              </div>
            )}
          </div>
        </section>
      </main>
    </AuthSessionContext.Provider>
  );
}
