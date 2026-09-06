import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TeacherAttendancePanel } from "@/features/hr/TeacherAttendancePanel";

export const Route = createFileRoute("/professor/presenca")({
  head: () => ({
    meta: [
      { title: "Presença do Professor · SIGA" },
      {
        name: "description",
        content:
          "Check-in, check-out por QR Code e histórico de aulas ministradas do professor autenticado.",
      },
    ],
  }),
  component: TeacherAttendancePage,
});

function TeacherAttendancePage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Professor"
          title="Presença e Hora/Aula"
          description="Registe a entrada e a saída das aulas por QR Code e acompanhe as suas horas ministradas."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/pedagogica">Área Pedagógica</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/calendario">Calendário</Link>
              </Button>
            </div>
          }
        />
        <TeacherAttendancePanel />
      </div>
    </AppShell>
  );
}
