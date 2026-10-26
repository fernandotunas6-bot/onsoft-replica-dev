import { useState, type FormEvent } from "react";
import { Check, KeyRound, LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publicErrorMessage } from "@/lib/public-error";
import { passwordChecksOf, passwordMeetsPolicy } from "@/lib/password-policy-error";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { completeFirstPasswordChange } from "./first-password-server";

const CHECKS: Array<[keyof ReturnType<typeof passwordChecksOf>, string]> = [
  ["length", "Pelo menos 8 caracteres"],
  ["upper", "Uma letra maiúscula"],
  ["lower", "Uma letra minúscula"],
  ["number", "Um número"],
];

/**
 * Primeiro acesso com a senha provisória da ficha: antes de entrar na aplicação,
 * o aluno escolhe a sua senha. Sem isto, a senha em papel ficava a valer.
 */
export function FirstPasswordScreen({ name }: { name: string | null }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = passwordChecksOf(password);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!passwordMeetsPolicy(password)) {
      setError("A senha ainda não cumpre todos os requisitos.");
      return;
    }
    if (password !== confirmation) {
      setError("As duas senhas não são iguais.");
      return;
    }
    setSaving(true);
    try {
      await completeFirstPasswordChange({ data: { password } });
      // O sinal vive no token: renovar a sessão traz o novo e abre a aplicação.
      await supabase.auth.refreshSession();
    } catch (cause) {
      setError(publicErrorMessage(cause, "Não foi possível guardar a senha."));
      setSaving(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm"
        aria-labelledby="first-password-title"
      >
        <div className="space-y-2">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <h1 id="first-password-title" className="text-lg font-semibold">
            {name ? `Bem-vindo, ${name.split(/\s+/)[0]}` : "Bem-vindo"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Entrou com a senha provisória da escola. Escolha agora a sua senha: é ela que vai usar
            daqui em diante, com o seu número de aluno.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="first-password">Nova senha</Label>
          <Input
            id="first-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <ul className="grid grid-cols-2 gap-1 text-xs" aria-label="Requisitos da senha">
          {CHECKS.map(([key, label]) => (
            <li
              key={key}
              className={cn(
                "flex items-center gap-1.5",
                checks[key] ? "text-success-strong" : "text-muted-foreground",
              )}
            >
              <Check className={cn("size-3.5", !checks[key] && "opacity-30")} aria-hidden />
              {label}
            </li>
          ))}
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="first-password-confirm">Repita a senha</Label>
          <Input
            id="first-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Guardar e entrar
        </Button>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-3.5" aria-hidden /> Sair
        </button>
      </form>
    </main>
  );
}
