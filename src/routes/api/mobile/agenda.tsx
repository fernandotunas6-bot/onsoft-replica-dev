import { createFileRoute } from "@tanstack/react-router";
import { getMyStudentAgenda } from "@/features/dashboard/student-agenda";
import { mobileRespond } from "@/features/mobile/api-response";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * O «Hoje» do aluno na app móvel: turma, média, próxima aula e próximas avaliações.
 * É o `getMyStudentAgenda` do painel do portal: o aluno vê a sua matrícula activa; o
 * encarregado, a do educando indicado (`student_id`), e só se estiver ligado a ele.
 *
 *   GET ?student_id=   { className, average, nextLesson, nextAssessment, upcomingAssessments }
 */
export const Route = createFileRoute("/api/mobile/agenda")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      GET: async ({ request }) =>
        mobileRespond(request, "api/mobile/agenda", async () => {
          const studentId = new URL(request.url).searchParams.get("student_id") || undefined;
          return getMyStudentAgenda({ data: studentId ? { studentId } : {} } as never);
        }),
    },
  },
});
