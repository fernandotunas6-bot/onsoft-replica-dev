import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TeacherQrIssuerPanel } from "@/features/hr/TeacherQrIssuerPanel";
import { SchoolQrPresencePanel } from "@/features/pedagogica/components/SchoolQrPresencePanel";

export const Route = createFileRoute("/pedagogica_/presenca-docente")({
  head: () => ({
    meta: [
      { title: "Presença Docente · Pedagógica · SIGA" },
      {
        name: "description",
        content:
          "QR da escola para confirmar a presença dos professores, com zona GPS e funcionamento sem internet.",
      },
    ],
  }),
  component: TeacherQrIssuerPage,
});

function TeacherQrIssuerPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title="Presença dos professores"
          description="A Direcção mostra o QR da escola e cada professor lê-o no telemóvel antes da aula."
          actions={
            <Button asChild variant="outline">
              <Link to="/pedagogica" search={{ tab: "horarios" }}>
                Ver horários
              </Link>
            </Button>
          }
        />
        <SchoolQrPresencePanel />
        {/* QR por aula do RH (folha salarial): só serve a escolas com contratos no RH. */}
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
            QR por aula para a folha salarial (RH)
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border p-3">
            <TeacherQrIssuerPanel />
          </div>
        </details>
      </div>
    </AppShell>
  );
}
