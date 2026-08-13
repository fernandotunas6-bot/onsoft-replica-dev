import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { requestSettingsOpen } from "@/lib/settings-deep-link";

// style-check: route-exempt - encaminha para o painel modal de configurações.

const configuracoesSearchSchema = z.object({
  painel: z.string().trim().min(1).max(80).optional(),
});

export const Route = createFileRoute("/configuracoes")({
  validateSearch: configuracoesSearchSchema,
  head: () => ({
    meta: [
      { title: "Configurações · SIGA" },
      {
        name: "description",
        content: "Definições da escola, integrações, financeiro, matrícula e segurança.",
      },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { painel } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    const normalized = painel?.trim().toLowerCase();
    if (normalized === "documentos" || normalized === "modelos") {
      void navigate({ to: "/documentos", hash: "modelos", replace: true });
      return;
    }
    requestSettingsOpen(painel);
    void navigate({ to: "/", replace: true });
  }, [navigate, painel]);

  return (
    <AppShell>
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" aria-label="A abrir configurações" />
      </div>
    </AppShell>
  );
}
