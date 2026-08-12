import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { PasswordChangeForm } from "@/features/auth/PasswordChangeForm";

export const Route = createFileRoute("/alterar-senha")({
  head: () => ({
    meta: [
      { title: "Alterar Senha · SIGA" },
      {
        name: "description",
        content:
          "Actualize a senha da sua conta SIGA e siga as recomendações de segurança da escola.",
      },
      { property: "og:title", content: "Alterar Senha · SIGA" },
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

        <Panel
          title="Nova senha"
          description="Mínimo de 10 caracteres, com letra, número e símbolo"
        >
          <PasswordChangeForm />
        </Panel>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-2">
            <p>
              Não partilhe a sua senha. A sessão é revalidada com a senha actual antes da alteração.
            </p>
            <p className="text-xs">
              Para activar autenticação de dois factores (2FA), um administrador pode configurar a
              política em Definições → Segurança. Depois de activo, o SIGA pede o código TOTP no
              próximo login.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
