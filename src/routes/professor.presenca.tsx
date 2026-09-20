import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TeacherAttendancePanel } from "@/features/hr/TeacherAttendancePanel";

const presenceSearchSchema = z.object({
  chamada: z.coerce.number().optional().catch(undefined),
  sessao: z.string().uuid().optional().catch(undefined),
  turma: z.string().uuid().optional().catch(undefined),
  disciplina: z.string().uuid().optional().catch(undefined),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/professor/presenca")({
  validateSearch: (search) => presenceSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Presença do Professor · SIGA" },
      {
        name: "description",
        content:
          "Check-in por QR, chamada da turma e histórico de aulas ministradas no telemóvel ou tablet.",
      },
    ],
  }),
  component: TeacherAttendancePage,
});

function TeacherAttendancePage() {
  const search = Route.useSearch();
  const initialCall =
    search.chamada === 1 && (search.sessao || (search.turma && search.disciplina))
      ? {
          sessionId: search.sessao,
          classGroupId: search.turma,
          subjectId: search.disciplina,
          date: search.data,
        }
      : null;
  const focusLesson =
    search.turma && search.disciplina
      ? {
          classGroupId: search.turma,
          subjectId: search.disciplina,
          date: search.data,
        }
      : null;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Professor"
          title="Presença e Hora/Aula"
          description="Leia o QR no telemóvel ou tablet para assinar a sua presença. Depois da entrada, o SIGA abre a lista de alunos da turma e da disciplina para a chamada."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/pedagogica" search={{ tab: "presencas" }}>
                  Área Pedagógica
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/calendario">Calendário</Link>
              </Button>
            </div>
          }
        />
        <TeacherAttendancePanel initialCall={initialCall} focusLesson={focusLesson} />
      </div>
    </AppShell>
  );
}
