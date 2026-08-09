import { createFileRoute } from "@tanstack/react-router";
import { Lock, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/alterar-senha")({
  head: () => ({
    meta: [
      { title: "Alterar Senha · ONSCHOOL" },
      {
        name: "description",
        content:
          "Actualize a senha da sua conta ONSCHOOL e siga as recomendações de segurança da escola.",
      },
      { property: "og:title", content: "Alterar Senha · ONSCHOOL" },
      { property: "og:description", content: "Actualize com segurança a senha da sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlterarSenhaPage,
});

function AlterarSenhaPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          group="Conta"
          title="Alterar Senha"
          description="Mantenha a sua conta segura actualizando periodicamente a senha de acesso."
        />

        <Panel title="Nova senha" description="Mínimo de 8 caracteres, com letras e números">
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <Label htmlFor="atual">Senha actual</Label>
              <Input id="atual" type="password" placeholder="••••••••" autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nova">Nova senha</Label>
              <Input id="nova" type="password" placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmar">Confirmar nova senha</Label>
              <Input id="confirmar" type="password" placeholder="••••••••" autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full gap-2">
              <Lock className="size-4" /> Actualizar senha
            </Button>
          </form>
        </Panel>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>
            Não partilhe a sua senha. A alteração efectiva será aplicada quando o backend de
            autenticação estiver ligado.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
