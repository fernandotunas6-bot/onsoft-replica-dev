import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { getMyWorkOverview } from "@/features/academic/subject-work-server";
import { submitTaskWork } from "@/features/academic/task-submissions-server";
import { mobileRespond } from "@/features/mobile/api-response";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * Os trabalhos do ano corrente do aluno, de todas as disciplinas, num só pedido
 * (`getMyWorkOverview`): o aluno vê os seus; o encarregado, os do educando indicado
 * (`student_id`). O aluno entrega pela mesma função do portal (`submitTaskWork`),
 * com as mesmas regras: só o próprio aluno, prazo e atrasos da tarefa, até ser
 * devolvido, anexo PDF/JPG/PNG/WebP até 5 MB confirmado pelos primeiros bytes.
 *
 *   GET ?student_id=   { canSubmit, summary, tasks: [{ id, title, subjectName, state, dueOn, latest, … }] }
 *   POST { action: "submit", taskId, body?, attachment?: { name, contentType, base64 } }
 *                      { attempt, late }
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
      POST: async ({ request }) =>
        mobileRespond(request, "api/mobile/work", async () => {
          const body = (await request.json().catch(() => null)) as MobileWorkBody | null;
          if (!body || typeof body !== "object" || body.action !== "submit") {
            throw new ZodError([]);
          }
          // Só os campos conhecidos seguem; o resto valida-o `submitTaskWork`.
          return submitTaskWork({
            data: {
              taskId: body.taskId,
              ...(typeof body.body === "string" && body.body.trim() ? { body: body.body } : {}),
              ...(body.attachment ? { attachment: body.attachment } : {}),
            },
          } as never);
        }),
    },
  },
});

type MobileWorkBody = {
  action?: string;
  taskId?: unknown;
  body?: unknown;
  attachment?: unknown;
};
