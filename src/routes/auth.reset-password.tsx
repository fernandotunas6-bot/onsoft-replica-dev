import { useState, useEffect, useMemo, type FormEvent } from "react";
import { publicErrorMessage } from "@/lib/public-error";
import { PWNED_PASSWORD_MESSAGE, passwordPolicyMessage } from "@/lib/password-policy-error";
import { passwordExposureCount } from "@/lib/pwned-password";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ShieldCheck,
  LockKeyhole,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  Building2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenant } from "@/features/saas/tenant-context";
import { getSchoolInitials } from "@/features/auth/email-templates/reset-password.html";
import { getAppName } from "@/lib/app-config";

// style-check: route-exempt - formulário de redefinição de senha.
export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir Senha · SIGA Plus" },
      {
        name: "description",
        content: "Defina com segurança uma nova senha de acesso à sua conta institucional.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { activeTenant } = useTenant();

  const [checking, setChecking] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const schoolName = activeTenant?.name || getAppName();
  const initials = useMemo(() => getSchoolInitials(schoolName), [schoolName]);

  // Validação de requisitos de senha
  const passwordChecks = useMemo(() => {
    return {
      length: password.length >= 8,
      hasLetter: /[a-zA-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[^a-zA-Z0-9]/.test(password),
      matches: password.length > 0 && password === confirmPassword,
    };
  }, [password, confirmPassword]);

  const isFormValid =
    passwordChecks.length &&
    passwordChecks.hasLetter &&
    passwordChecks.hasNumber &&
    passwordChecks.matches;

  useEffect(() => {
    let active = true;

    const parseAuthFromUrl = async () => {
      if (typeof window === "undefined") return;

      const hash = window.location.hash;
      const searchParams = new URLSearchParams(window.location.search);

      // Verificar se há erro nos parâmetros do URL
      const errorParam = searchParams.get("error") || (hash.includes("error=") ? "error" : null);
      const errorDescription = searchParams.get("error_description");

      if (errorParam) {
        if (!active) return;
        setTokenError(
          errorDescription
            ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
            : "O link de recuperação de senha é inválido ou expirou.",
        );
        setChecking(false);
        return;
      }

      // Verificar se há code para troca de sessão (PKCE)
      const code = searchParams.get("code");
      if (code) {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          if (!active) return;
          setHasValidSession(true);
          setChecking(false);
          return;
        } catch (err) {
          if (!active) return;
          console.warn("[ResetPassword] exchangeCodeForSession failed:", err);
          setTokenError("O código de recuperação de senha é inválido ou já foi utilizado.");
          setChecking(false);
          return;
        }
      }

      // Verificar se há token_hash
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (tokenHash && type === "recovery") {
        try {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (otpError) throw otpError;
          if (!active) return;
          setHasValidSession(true);
          setChecking(false);
          return;
        } catch (err) {
          if (!active) return;
          console.warn("[ResetPassword] verifyOtp failed:", err);
          setTokenError("O token de recuperação é inválido ou expirou.");
          setChecking(false);
          return;
        }
      }

      // Verificar sessão existente ou processada via hash
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          setHasValidSession(true);
        } else {
          // Aguardar evento do listener caso o cliente esteja a processar o hash
          setTimeout(async () => {
            if (!active) return;
            const { data: retryData } = await supabase.auth.getSession();
            if (retryData.session) {
              setHasValidSession(true);
            } else {
              setTokenError(
                "Nenhum token de recuperação encontrado ou a sessão de redefinição expirou.",
              );
            }
            setChecking(false);
          }, 800);
          return;
        }
      } catch (err) {
        if (!active) return;
        setTokenError("Não foi possível validar o link de recuperação.");
      } finally {
        if (active) setChecking(false);
      }
    };

    void parseAuthFromUrl();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasValidSession(true);
        setTokenError(null);
        setChecking(false);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isFormValid) {
      toast.error("Por favor preencha os requisitos da senha.");
      return;
    }

    setSubmitting(true);
    try {
      if (await passwordExposureCount(password.trim())) {
        toast.error(PWNED_PASSWORD_MESSAGE);
        return;
      }
      const { error } = await supabase.auth.updateUser({
        password: password.trim(),
      });

      if (error) {
        throw error;
      }

      setSuccess(true);
      toast.success("Senha atualizada com sucesso!");

      // Redirecionamento amigável após 2.5s
      setTimeout(() => {
        void navigate({ to: "/" });
      }, 2500);
    } catch (err) {
      const msg =
        passwordPolicyMessage(err) ??
        publicErrorMessage(err, "Não foi possível atualizar a senha. Tente novamente.");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-muted/20 p-4 sm:p-6">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border bg-card">
          <CardHeader className="text-center pb-4">
            {/* Header com Branding da Escola */}
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-xl">
              {initials}
            </div>

            <p className="text-xs font-semibold text-muted-foreground">Conta Institucional</p>
            <CardTitle className="text-xl font-bold tracking-tight text-foreground mt-0.5">
              {schoolName}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              {success
                ? "A sua senha foi atualizada"
                : tokenError
                  ? "Link de recuperação inválido"
                  : "Defina uma nova senha de acesso"}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-2 space-y-4">
            {checking && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground text-sm">
                <LoaderCircle className="size-6 animate-spin text-primary" />
                <span>A validar autorização de recuperação…</span>
              </div>
            )}

            {!checking && tokenError && !success && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                  <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Não foi possível continuar</p>
                    <p className="text-xs opacity-90">{tokenError}</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Button asChild className="w-full gap-2">
                    <Link to="/">
                      <RefreshCw className="size-4" />
                      Pedir Novo Link de Recuperação
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="w-full text-xs">
                    <Link to="/">Voltar ao Início</Link>
                  </Button>
                </div>
              </div>
            )}

            {!checking && !tokenError && success && (
              <div className="space-y-4 py-3">
                <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">
                  <CheckCircle2 className="size-5 shrink-0 text-success mt-0.5" />
                  <div>
                    <p className="font-semibold">Senha atualizada com sucesso!</p>
                    <p className="text-xs opacity-90">A redireccionar para o início de sessão…</p>
                  </div>
                </div>

                <Button asChild className="w-full gap-2 mt-4">
                  <Link to="/">
                    Entrar no Portal Agora
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            )}

            {!checking && !tokenError && !success && hasValidSession && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs font-medium">
                    Nova senha
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="new-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="pr-10 pl-9 h-10 text-sm"
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="absolute top-1/2 right-1.5 flex size-[28px] -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs font-medium">
                    Confirmar nova senha
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className="pl-9 h-10 text-sm"
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                {/* Requisitos de segurança em tempo real */}
                <div className="rounded-xl border border-border/80 bg-muted/40 p-3.5 space-y-2 text-xs">
                  <p className="font-semibold text-muted-foreground text-[11px]">
                    Requisitos da Senha
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div
                      className={`flex items-center gap-1.5 ${passwordChecks.length ? "text-success font-medium" : "text-muted-foreground"}`}
                    >
                      <CheckCircle2
                        className={`size-3.5 ${passwordChecks.length ? "opacity-100" : "opacity-40"}`}
                      />
                      <span>Mínimo 8 caracteres</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${passwordChecks.hasLetter ? "text-success font-medium" : "text-muted-foreground"}`}
                    >
                      <CheckCircle2
                        className={`size-3.5 ${passwordChecks.hasLetter ? "opacity-100" : "opacity-40"}`}
                      />
                      <span>Pelo menos 1 letra</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${passwordChecks.hasNumber ? "text-success font-medium" : "text-muted-foreground"}`}
                    >
                      <CheckCircle2
                        className={`size-3.5 ${passwordChecks.hasNumber ? "opacity-100" : "opacity-40"}`}
                      />
                      <span>Pelo menos 1 número</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${passwordChecks.matches ? "text-success font-medium" : "text-muted-foreground"}`}
                    >
                      <CheckCircle2
                        className={`size-3.5 ${passwordChecks.matches ? "opacity-100" : "opacity-40"}`}
                      />
                      <span>Senhas coincidem</span>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full gap-2 h-10 font-semibold"
                  disabled={submitting || !isFormValid}
                >
                  {submitting ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      <span>A guardar nova senha…</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4" />
                      <span>Atualizar Senha</span>
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Footer Institucional */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Gerido com segurança por{" "}
          <span className="font-semibold text-foreground">{getAppName()}</span>
        </p>
      </div>
    </main>
  );
}
