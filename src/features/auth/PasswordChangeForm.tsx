import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  PASSWORD_POLICY_HINT,
  PWNED_PASSWORD_MESSAGE,
  passwordMeetsPolicy,
  passwordPolicyMessage,
} from "@/lib/password-policy-error";
import { passwordExposureCount } from "@/lib/pwned-password";
import { useAuthSession } from "@/components/auth/AuthGate";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOptionalStackNav } from "@/components/ui/stacked-modal";
import { supabase } from "@/integrations/supabase/client";
import {
  factorsForSensitiveChange,
  isInsufficientAalError,
  type VerificationFactors,
} from "@/features/auth/verification";

type PendingSecondFactor = {
  factors: VerificationFactors;
  password: string;
  form: HTMLFormElement;
};

const UPDATE_FAILED = "Não foi possível actualizar a senha. Tente novamente.";

export function PasswordChangeForm({ compact = false }: { compact?: boolean }) {
  const session = useAuthSession();
  const [saving, setSaving] = useState(false);
  // A reautenticação por senha dá uma sessão aal1; numa conta com 2FA o Supabase
  // só aceita a nova senha depois do segundo factor. A senha fica à espera aqui.
  const [pendingMfa, setPendingMfa] = useState<PendingSecondFactor | null>(null);
  const stackNav = useOptionalStackNav();

  if (!session) return null;

  const applyUpdate = async (
    password: string,
    form: HTMLFormElement,
  ): Promise<"done" | "needs-mfa"> => {
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      if (isInsufficientAalError(updateError)) {
        const factors = await factorsForSensitiveChange().catch(() => null);
        if (factors) {
          setPendingMfa({ factors, password, form });
          return "needs-mfa";
        }
      }
      throw updateError;
    }

    // Quem mudou a senha por suspeita não quer outras sessões abertas com a
    // antiga: terminam todas, menos esta.
    await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);

    setPendingMfa(null);
    form.reset();
    stackNav?.reportDirty(false);
    toast.success("Senha actualizada. As outras sessões desta conta foram terminadas.");
    return "done";
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const currentPassword = String(values.get("currentPassword") ?? "");
    const password = String(values.get("password") ?? "");
    const confirmation = String(values.get("confirmation") ?? "");

    if (password !== confirmation) {
      toast.error("A confirmação da nova senha não corresponde.");
      return;
    }
    if (password === currentPassword) {
      toast.error("A nova senha deve ser diferente da senha actual.");
      return;
    }
    if (!passwordMeetsPolicy(password)) {
      toast.error(PASSWORD_POLICY_HINT);
      return;
    }
    if (!session.user.email) {
      toast.error("A conta autenticada não possui um e-mail válido.");
      return;
    }

    setSaving(true);
    try {
      if (await passwordExposureCount(password)) {
        toast.error(PWNED_PASSWORD_MESSAGE);
        return;
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });
      if (reauthError) {
        toast.error("A senha actual está incorrecta.");
        return;
      }

      const factors = await factorsForSensitiveChange().catch(() => null);
      if (factors) {
        setPendingMfa({ factors, password, form });
        return;
      }
      await applyUpdate(password, form);
    } catch (error) {
      toast.error(passwordPolicyMessage(error) ?? UPDATE_FAILED);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={updatePassword}
        onChange={() => stackNav?.reportDirty(true)}
        hidden={Boolean(pendingMfa)}
      >
        <div className={compact ? "grid gap-4" : "space-y-4"}>
          <PasswordField
            id={compact ? "set-pass-old" : "atual"}
            name="currentPassword"
            label="Senha actual"
            autoComplete="current-password"
          />
          <PasswordField
            id={compact ? "set-pass-new" : "nova"}
            name="password"
            label="Nova senha"
            autoComplete="new-password"
            minLength={10}
          />
          <PasswordField
            id={compact ? "set-pass-rep" : "confirmar"}
            name="confirmation"
            label="Confirmar nova senha"
            autoComplete="new-password"
            minLength={10}
          />
        </div>
        <Button
          type="submit"
          className={compact ? "ml-auto flex" : "w-full gap-2"}
          disabled={saving}
        >
          {saving ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : (
            <KeyRound className="mr-2 size-4" />
          )}
          {saving ? "A actualizar…" : "Actualizar senha"}
        </Button>
      </form>
      {pendingMfa ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Esta conta tem verificação em dois passos. Confirme que é você para guardar a nova
            senha.
          </p>
          <MfaChallenge
            factors={pendingMfa.factors}
            onVerified={async () => {
              let outcome: "done" | "needs-mfa";
              try {
                outcome = await applyUpdate(pendingMfa.password, pendingMfa.form);
              } catch (error) {
                throw new Error(passwordPolicyMessage(error) ?? UPDATE_FAILED);
              }
              if (outcome === "needs-mfa") {
                throw new Error("A confirmação não foi aceite. Tente de novo.");
              }
            }}
            onCancel={() => setPendingMfa(null)}
            cancelLabel="Voltar"
          />
        </div>
      ) : null}
    </>
  );
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  minLength,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="password"
        required
        minLength={minLength}
        placeholder="••••••••••"
        autoComplete={autoComplete}
      />
    </div>
  );
}
