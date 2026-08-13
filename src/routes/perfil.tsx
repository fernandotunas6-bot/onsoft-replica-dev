import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound, UserCog } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ProfileSettingsPanel } from "@/features/auth/ProfileSettingsPanel";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil · SIGA" },
      {
        name: "description",
        content: "Foto, nome e telemóvel da sua conta SIGA.",
      },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          group="Conta"
          title="Perfil"
          description="Foto, nome e telemóvel — visíveis para os colegas nas mensagens e nos documentos que emitir."
          actions={
            <Button variant="outline" className="gap-2" asChild>
              <Link to="/alterar-senha">
                <KeyRound className="size-4" /> Palavra-passe
              </Link>
            </Button>
          }
        />

        <Panel title="Dados da conta" description="Nome completo, telemóvel e foto" icon={UserCog}>
          <ProfileSettingsPanel />
        </Panel>
      </div>
    </AppShell>
  );
}
