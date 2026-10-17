import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import {
  editFinalizedAttendanceCall,
  getAttendanceCallSheet,
  listTeacherAttendanceSessions,
  submitAttendanceCallBatch,
} from "@/features/pedagogica/attendance-server";
import { isSessionMfaError } from "@/integrations/supabase/session-mfa";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

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
        respond(request, async () => {
          const url = new URL(request.url);
          const sessionId = url.searchParams.get("session_id");
          if (sessionId) return getAttendanceCallSheet({ data: { sessionId } });
          const date = url.searchParams.get("date") ?? undefined;
          return listTeacherAttendanceSessions({ data: { date } });
        }),
      POST: async ({ request }) =>
        respond(request, async () => {
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

/**
 * Erros com o mesmo texto que o SIGA mostra (são escritos para a pessoa e os
 * da base passam por publicDatabaseError). Um erro inesperado não sai: só um
 * código genérico, para não expor detalhes internos.
 */
async function respond(request: Request, run: () => Promise<unknown>): Promise<Response> {
  try {
    return jsonWithCors(request, await run());
  } catch (error) {
    const status = (error as { statusCode?: number } | null)?.statusCode;
    if (status === 401) {
      return jsonWithCors(request, { error: "SESSION_INVALID" }, { status: 401 });
    }
    if (isSessionMfaError(error)) {
      return jsonWithCors(
        request,
        { error: "MFA_REQUIRED", message: "Esta conta exige verificação em dois passos." },
        { status: 403 },
      );
    }
    if (error instanceof ZodError) {
      return jsonWithCors(request, { error: "INVALID_INPUT" }, { status: 422 });
    }
    if (error instanceof Error && error.constructor === Error && error.message) {
      return jsonWithCors(request, { error: "REJECTED", message: error.message }, { status: 400 });
    }
    console.error("[api/mobile/attendance]", error instanceof Error ? error.name : "erro");
    return jsonWithCors(request, { error: "FAILURE" }, { status: 500 });
  }
}
