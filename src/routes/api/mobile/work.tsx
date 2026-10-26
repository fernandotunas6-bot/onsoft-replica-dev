import { createFileRoute } from "@tanstack/react-router";
import { getMyWorkOverview } from "@/features/academic/subject-work-server";
import { mobileRespond } from "@/features/mobile/api-response";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * Os trabalhos do ano corrente do aluno, de todas as disciplinas, num só pedido
 * (`getMyWorkOverview`): o aluno vê os seus; o encarregado, os do educando indicado
 * (`student_id`). Entregar continua no portal (`submitTaskWork`).
 *
 *   GET ?student_id=   { canSubmit, summary, tasks: [{ id, title, subjectName, state, dueOn, latest, … }] }
 */
export const Route = createFileRoute("/api/mobile/work")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      GET: async ({ request }) =>
        mobileRespond(request, "api/mobile/work", async () => {
          const studentId = new URL(request.url).searchParams.get("student_id") || undefined;
          return getMyWorkOverview({ data: studentId ? { studentId } : {} } as never);
        }),
    },
  },
});
