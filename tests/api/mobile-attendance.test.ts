import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A rota da app móvel não decide nada: passa o pedido às funções de servidor
 * do SIGA (que aplicam sessão, MFA, papel, módulo, escola bloqueada, pauta e
 * auditoria) e traduz a resposta. Aqui confirma-se essa tradução.
 */
const fns = vi.hoisted(() => ({
  listTeacherAttendanceSessions: vi.fn(),
  getAttendanceCallSheet: vi.fn(),
  submitAttendanceCallBatch: vi.fn(),
  editFinalizedAttendanceCall: vi.fn(),
}));
vi.mock("@/features/pedagogica/attendance-server", () => fns);

type Handler = (ctx: { request: Request }) => Promise<Response>;
async function handlers() {
  const { Route } = await import("@/routes/api/mobile/attendance");
  return (Route.options as unknown as { server: { handlers: Record<string, Handler> } }).server
    .handlers;
}
const req = (path: string, init: RequestInit = {}) =>
  new Request(`https://portal-siga.com/api/mobile/attendance${path}`, {
    ...init,
    headers: { Authorization: "Bearer t", Origin: "https://m.portal-siga.com", ...init.headers },
  });

beforeEach(() => {
  for (const fn of Object.values(fns)) fn.mockReset();
});

describe("/api/mobile/attendance", () => {
  it("GET sem sessão: aulas do dia, com a data pedida", async () => {
    fns.listTeacherAttendanceSessions.mockResolvedValue({
      sessions: [],
      date: "2026-10-16",
      pendingCount: 0,
    });
    const res = await (await handlers()).GET!({ request: req("?date=2026-10-16") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessions: [], date: "2026-10-16", pendingCount: 0 });
    expect(fns.listTeacherAttendanceSessions).toHaveBeenCalledWith({
      data: { date: "2026-10-16" },
    });
    // A app é servida em m.<domínio>: o CORS do SIGA aceita os subdomínios.
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://m.portal-siga.com");
  });

  it("GET ?session_id: folha de chamada", async () => {
    fns.getAttendanceCallSheet.mockResolvedValue({
      session: { id: "s" },
      students: [],
      totalCount: 0,
    });
    await (
      await handlers()
    ).GET!({ request: req("?session_id=s-1") });
    expect(fns.getAttendanceCallSheet).toHaveBeenCalledWith({ data: { sessionId: "s-1" } });
  });

  it("POST grava a chamada com os campos do SIGA; com motivo, corrige", async () => {
    fns.submitAttendanceCallBatch.mockResolvedValue({ ok: true, sessionId: "s-1", count: 1 });
    fns.editFinalizedAttendanceCall.mockResolvedValue({ ok: true, editedCount: 1 });
    const h = await handlers();
    const body = { session_id: "s-1", records: [{ student_id: "st-1", status: "absent" }] };
    const res = await h.POST!({ request: req("", { method: "POST", body: JSON.stringify(body) }) });
    expect(res.status).toBe(200);
    expect(fns.submitAttendanceCallBatch).toHaveBeenCalledWith({
      data: {
        sessionId: "s-1",
        records: [{ studentId: "st-1", status: "absent", notes: undefined }],
      },
    });
    await h.POST!({
      request: req("", {
        method: "POST",
        body: JSON.stringify({ ...body, reason: "Engano na chamada" }),
      }),
    });
    expect(fns.editFinalizedAttendanceCall).toHaveBeenCalledWith({
      data: {
        sessionId: "s-1",
        reason: "Engano na chamada",
        records: [{ studentId: "st-1", status: "absent", notes: undefined }],
      },
    });
  });

  it("erros: sessão 401, MFA 403, entrada 422, regra do SIGA 400 com a mensagem, inesperado 500 sem detalhe", async () => {
    const h = await handlers();
    const call = async (error: unknown) => {
      fns.listTeacherAttendanceSessions.mockRejectedValueOnce(error);
      const res = await h.GET!({ request: req("") });
      return { status: res.status, body: await res.json() };
    };
    expect(await call(Object.assign(new Error("Unauthorized"), { statusCode: 401 }))).toEqual({
      status: 401,
      body: { error: "SESSION_INVALID" },
    });
    expect((await call(Object.assign(new Error("x"), { sessionMfa: true }))).status).toBe(403);
    const { ZodError } = await import("zod");
    expect((await call(new ZodError([]))).status).toBe(422);
    expect(await call(new Error("A pauta deste período já é oficial."))).toEqual({
      status: 400,
      body: { error: "REJECTED", message: "A pauta deste período já é oficial." },
    });
    expect(await call(new TypeError("Cannot read properties of undefined (reading 'id')"))).toEqual(
      {
        status: 500,
        body: { error: "FAILURE" },
      },
    );
    const bad = await h.POST!({ request: req("", { method: "POST", body: "não é json" }) });
    expect(bad.status).toBe(422);
  });
});
