import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TeacherAttendancePanel } from "@/features/hr/TeacherAttendancePanel";
import { TeacherTodayLessonsPanel } from "@/features/hr/TeacherTodayLessonsPanel";

const presenceSearchSchema = z.object({
  chamada: z.coerce.number().optional().catch(undefined),
  sessao: z.string().guid().optional().catch(undefined),
  turma: z.string().guid().optional().catch(undefined),
  disciplina: z.string().guid().optional().catch(undefined),
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
          "Confirmação de presença na sala, chamada da turma, check-in por QR e histórico de aulas no telemóvel ou tablet.",
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
          description="Confirme que está na sala e faça a chamada dos alunos."
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
        <TeacherTodayLessonsPanel />
        <TeacherAttendancePanel initialCall={initialCall} focusLesson={focusLesson} />
      </div>
    </AppShell>
  );
}
