import { lazy, Suspense, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { requestSettingsOpen } from "@/lib/settings-deep-link";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { workspacePresentation } from "@/lib/workspace-presentation";

const SettingsCenter = lazy(() =>
  import("@/components/modals/SettingsCenter").then(({ SettingsCenter }) => ({
    default: SettingsCenter,
  })),
);

// style-check: route-exempt - centro partilhado de definições, com título próprio.

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
  const { school, isLoading } = useSchoolSettings();
  const { settingsModal } = workspacePresentation(school?.preferences);

  useEffect(() => {
    const normalized = painel?.trim().toLowerCase();
    if (normalized === "documentos" || normalized === "modelos") {
      void navigate({ to: "/documentos", hash: "modelos", replace: true });
      return;
    }
    if (!isLoading && settingsModal) {
      requestSettingsOpen(painel);
      void navigate({ to: "/", replace: true });
    }
  }, [navigate, painel, isLoading, settingsModal]);

  return (
    <AppShell>
      {isLoading || settingsModal ? (
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" aria-label="A abrir configurações" />
        </div>
      ) : (
        <Suspense fallback={<p role="status">A abrir definições…</p>}>
          <SettingsCenter
            open
            presentation="page"
            initialPanelId={painel}
            onOpenChange={(open) => {
              if (!open) void navigate({ to: "/" });
            }}
          />
        </Suspense>
      )}
    </AppShell>
  );
}
