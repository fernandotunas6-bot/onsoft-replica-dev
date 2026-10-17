import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { mobileRespond } from "@/features/mobile/api-response";
import {
  editFinalizedAttendanceCall,
  getAttendanceCallSheet,
  listTeacherAttendanceSessions,
  submitAttendanceCallBatch,
} from "@/features/pedagogica/attendance-server";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * Chamada do professor para a app móvel. Não tem regras próprias: chama as
 * mesmas funções de servidor que o ecrã Pedagógica → Chamada, por isso a
 * sessão e o MFA (requireSupabaseAuth, pelo cabeçalho Authorization), o papel
 * e as permissões do módulo, a escola bloqueada, «só as suas aulas», a pauta
 * oficial, os alunos matriculados e a auditoria das correcções são os do SIGA.
 *
 *   GET  ?date=YYYY-MM-DD   aulas do dia (cria as sessões que faltam, como o ecrã)
 *   GET  ?session_id=uuid   folha de chamada de uma aula
 *   POST { session_id, records: [{ student_id, status, notes? }], reason? }
 *        sem reason grava e fecha a chamada; com reason corrige uma fechada.
 */
export const Route = createFileRoute("/api/mobile/attendance")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      GET: async ({ request }) =>
        mobileRespond(request, "api/mobile/attendance", async () => {
          const url = new URL(request.url);
          const sessionId = url.searchParams.get("session_id");
          if (sessionId) return getAttendanceCallSheet({ data: { sessionId } });
          const date = url.searchParams.get("date") ?? undefined;
          return listTeacherAttendanceSessions({ data: { date } });
        }),
      POST: async ({ request }) =>
        mobileRespond(request, "api/mobile/attendance", async () => {
          const body = (await request.json().catch(() => null)) as MobileAttendanceBody | null;
          if (!body || typeof body !== "object") throw new ZodError([]);
          const records = (Array.isArray(body.records) ? body.records : []).map((r) => ({
            studentId: r?.student_id,
            status: r?.status,
            notes: r?.notes ?? undefined,
          }));
          if (typeof body.reason === "string" && body.reason.trim()) {
            return editFinalizedAttendanceCall({
              data: { sessionId: body.session_id, reason: body.reason, records },
            } as never);
          }
          return submitAttendanceCallBatch({
            data: { sessionId: body.session_id, records },
          } as never);
        }),
    },
  },
});

type MobileAttendanceBody = {
  session_id?: unknown;
  reason?: unknown;
  records?: Array<{ student_id?: unknown; status?: unknown; notes?: unknown } | null>;
};
