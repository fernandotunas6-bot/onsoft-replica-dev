import { createFileRoute } from "@tanstack/react-router";
import { getMyAbsencesBySubject } from "@/features/dashboard/student-absences";
import { mobileRespond } from "@/features/mobile/api-response";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * Faltas por disciplina para a app móvel (`getMyAbsencesBySubject`): o aluno vê as
 * suas; o encarregado, as do educando indicado (`student_id`), e só se estiver
 * ligado a ele. Com o limite de faltas do modelo de avaliação em vigor.
 *
 *   GET ?student_id=   { limitPercentage, subjects: [{ subjectName, lessons, absences,
 *                        percentage, remaining, status }], totals }
 */
export const Route = createFileRoute("/api/mobile/absences")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      GET: async ({ request }) =>
        mobileRespond(request, "api/mobile/absences", async () => {
          const studentId = new URL(request.url).searchParams.get("student_id") || undefined;
          return getMyAbsencesBySubject({ data: studentId ? { studentId } : {} } as never);
        }),
    },
  },
});
