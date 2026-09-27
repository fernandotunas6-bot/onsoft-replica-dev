import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TeacherQrIssuerPanel } from "@/features/hr/TeacherQrIssuerPanel";

export const Route = createFileRoute("/pedagogica_/presenca-docente")({
  head: () => ({
    meta: [
      { title: "Presença Docente · Pedagógica · SIGA" },
      {
        name: "description",
        content: "Emissão segura de QR por aula para entrada e saída dos professores.",
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
          group="Pedagógica"
          title="Presença dos professores"
          description="A Direcção Pedagógica sincroniza o horário publicado e apresenta na sala o QR temporário da aula."
          actions={
            <Button asChild variant="outline">
              <Link to="/pedagogica" search={{ tab: "horarios" }}>
                Ver horários
              </Link>
            </Button>
          }
        />
        <TeacherQrIssuerPanel />
      </div>
    </AppShell>
  );
}
