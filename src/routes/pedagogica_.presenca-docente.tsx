import { createFileRoute, Link } from "@tanstack/react-router";
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
          description="A Direcção mostra o QR da escola e cada professor lê-o no telemóvel antes da aula. Funciona sem internet e trava leituras feitas longe da escola."
          actions={
            <Button asChild variant="outline">
              <Link to="/pedagogica" search={{ tab: "horarios" }}>
                Ver horários
              </Link>
            </Button>
          }
        />
        <SchoolQrPresencePanel />
        <TeacherQrIssuerPanel />
      </div>
    </AppShell>
  );
}
