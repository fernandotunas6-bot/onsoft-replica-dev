import { useState, type FormEvent } from "react";
import { Mail, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuthSession } from "@/components/auth/AuthGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOptionalStackNav } from "@/components/ui/stacked-modal";

export function EmailChangeForm({ compact = false }: { compact?: boolean }) {
  const session = useAuthSession();
  const [saving, setSaving] = useState(false);
  const stackNav = useOptionalStackNav();

  if (!session) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const newEmail = String(values.get("newEmail") ?? "")
      .trim()
      .toLowerCase();
    const currentPassword = String(values.get("currentPassword") ?? "");

    if (newEmail === session.user.email?.toLowerCase()) {
      toast.error("O novo e-mail deve ser diferente do actual.");
      return;
    }

    setSaving(true);
    try {
      const { requestEmailChangeFn } = await import("./email-change-server");
      const hostname = typeof window !== "undefined" ? window.location.hostname : undefined;
      const result = await requestEmailChangeFn({
        data: { newEmail, currentPassword, hostname },
      });
      toast.success("Confirmação enviada", { description: result.message });
      form.reset();
      stackNav?.reportDirty(false);
    } catch (error) {
      toast.error("Não foi possível iniciar a alteração", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit} onChange={() => stackNav?.reportDirty(true)}>
      <div className={compact ? "grid gap-4" : "space-y-4"}>
        <div className="space-y-2">
          <Label htmlFor={compact ? "set-email-current" : "email-actual"}>E-mail actual</Label>
          <Input
            id={compact ? "set-email-current" : "email-actual"}
            value={session.user.email ?? ""}
            disabled
            readOnly
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={compact ? "set-email-new" : "email-novo"}>Novo e-mail</Label>
          <Input
            id={compact ? "set-email-new" : "email-novo"}
            name="newEmail"
            type="email"
            required
            placeholder="novo.email@escola.ao"
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={compact ? "set-email-password" : "email-senha"}>Senha actual</Label>
          <Input
            id={compact ? "set-email-password" : "email-senha"}
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Enviaremos um link de confirmação para o novo endereço e um aviso para o actual. O e-mail só
        muda depois de confirmar.
      </p>
      <Button type="submit" className={compact ? "ml-auto flex" : "w-full gap-2"} disabled={saving}>
        {saving ? (
          <LoaderCircle className="mr-2 size-4 animate-spin" />
        ) : (
          <Mail className="mr-2 size-4" />
        )}
        {saving ? "A enviar…" : "Enviar confirmação"}
      </Button>
    </form>
  );
}
