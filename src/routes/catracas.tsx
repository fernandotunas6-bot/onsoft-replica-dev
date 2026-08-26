import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { TurnstileAccessPanel } from "@/features/catracas/components/TurnstileAccessPanel";

export const Route = createFileRoute("/catracas")({
  head: () => ({
    meta: [
      { title: "Catracas & Controlo de Acesso · SIGA" },
      {
        name: "description",
        content:
          "Gestão de catracas físicas, portaria, leitores de QR code e cartões virtuais de estudantes.",
      },
    ],
  }),
  component: CatracasPage,
});

function CatracasPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Acessos"
          title="Catracas & Cartão Virtual de Acesso"
          description="Gestão de hardware de catracas, leitores de portaria, cartões digitais e auditoria de recinto."
        />
        <TurnstileAccessPanel />
      </div>
    </AppShell>
  );
}
