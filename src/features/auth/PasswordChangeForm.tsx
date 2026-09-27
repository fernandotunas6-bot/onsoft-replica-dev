import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { PWNED_PASSWORD_MESSAGE, passwordPolicyMessage } from "@/lib/password-policy-error";
import { passwordExposureCount } from "@/lib/pwned-password";
import { useAuthSession } from "@/components/auth/AuthGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOptionalStackNav } from "@/components/ui/stacked-modal";
import { supabase } from "@/integrations/supabase/client";

export function PasswordChangeForm({ compact = false }: { compact?: boolean }) {
  const session = useAuthSession();
  const [saving, setSaving] = useState(false);
  const stackNav = useOptionalStackNav();

  if (!session) return null;

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
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      toast.error("Use pelo menos uma letra, um número e um símbolo.");
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

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // Quem mudou a senha por suspeita não quer outras sessões abertas com a
      // antiga: terminam todas, menos esta.
      await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);

      form.reset();
      stackNav?.reportDirty(false);
      toast.success("Senha actualizada. As outras sessões desta conta foram terminadas.");
    } catch (error) {
      toast.error(
        passwordPolicyMessage(error) ?? "Não foi possível actualizar a senha. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={updatePassword}
      onChange={() => stackNav?.reportDirty(true)}
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
      <Button type="submit" className={compact ? "ml-auto flex" : "w-full gap-2"} disabled={saving}>
        {saving ? (
          <LoaderCircle className="mr-2 size-4 animate-spin" />
        ) : (
          <KeyRound className="mr-2 size-4" />
        )}
        {saving ? "A actualizar…" : "Actualizar senha"}
      </Button>
    </form>
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
