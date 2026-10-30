import { beforeEach, describe, expect, it, vi } from "vitest";

/** As rotas são as funções do portal: a app recebe o mesmo que o painel do aluno. */
const fns = vi.hoisted(() => ({
  getMyStudentAgenda: vi.fn(),
  getMyWorkOverview: vi.fn(),
  submitTaskWork: vi.fn(),
}));
vi.mock("@/features/dashboard/student-agenda", () => ({
  getMyStudentAgenda: fns.getMyStudentAgenda,
}));
vi.mock("@/features/academic/subject-work-server", () => ({
  getMyWorkOverview: fns.getMyWorkOverview,
}));
vi.mock("@/features/academic/task-submissions-server", () => ({
  submitTaskWork: fns.submitTaskWork,
}));

type Handler = (ctx: { request: Request }) => Promise<Response>;
async function handlers(route: "agenda" | "work") {
  const { Route } = await import(`@/routes/api/mobile/${route}`);
  return (Route.options as unknown as { server: { handlers: Record<string, Handler> } }).server
    .handlers;
}
const get = (path: string) =>
  new Request(`https://portal-siga.com${path}`, { headers: { Authorization: "Bearer t" } });
const STUDENT = "00000000-0000-0000-0000-0000000000c1";
const TASK = "00000000-0000-0000-0000-0000000000d1";
const post = (body: unknown) =>
  new Request("https://portal-siga.com/api/mobile/work", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  fns.getMyStudentAgenda.mockReset();
  fns.getMyWorkOverview.mockReset();
  fns.submitTaskWork.mockReset();
});

describe("/api/mobile/agenda e /api/mobile/work", () => {
  it("agenda: sem student_id é a do próprio aluno; com ele, a do educando", async () => {
    fns.getMyStudentAgenda.mockResolvedValue({ className: "10.ª A", average: 13.4 });
    const h = await handlers("agenda");
    const res = await h.GET!({ request: get("/api/mobile/agenda") });
    expect(await res.json()).toEqual({ className: "10.ª A", average: 13.4 });
    expect(fns.getMyStudentAgenda).toHaveBeenLastCalledWith({ data: {} });
    await h.GET!({ request: get(`/api/mobile/agenda?student_id=${STUDENT}`) });
    expect(fns.getMyStudentAgenda).toHaveBeenLastCalledWith({ data: { studentId: STUDENT } });
  });

  it("trabalhos: passa o educando e devolve a visão geral tal e qual", async () => {
    const overview = { canSubmit: false, summary: { total: 1 }, tasks: [{ id: "t1" }] };
    fns.getMyWorkOverview.mockResolvedValue(overview);
    const res = await (
      await handlers("work")
    ).GET!({
      request: get(`/api/mobile/work?student_id=${STUDENT}`),
    });
    expect(fns.getMyWorkOverview).toHaveBeenCalledWith({ data: { studentId: STUDENT } });
    expect(await res.json()).toEqual(overview);
  });

  it("sem sessão: 401 como as outras rotas móveis", async () => {
    fns.getMyWorkOverview.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    );
    const res = await (await handlers("work")).GET!({ request: get("/api/mobile/work") });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "SESSION_INVALID" });
  });

  it("entregar: passa a tarefa, o texto e o anexo à função do portal", async () => {
    fns.submitTaskWork.mockResolvedValue({ attempt: 1, late: false });
    const attachment = { name: "trabalho.pdf", contentType: "application/pdf", base64: "JVBERi0=" };
    const res = await (
      await handlers("work")
    ).POST!({
      request: post({ action: "submit", taskId: TASK, body: "  Feito.  ", attachment, extra: 1 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ attempt: 1, late: false });
    expect(fns.submitTaskWork).toHaveBeenCalledWith({
      data: { taskId: TASK, body: "  Feito.  ", attachment },
    });
  });

  it("entregar sem texto: não manda o campo vazio", async () => {
    fns.submitTaskWork.mockResolvedValue({ attempt: 2, late: true });
    const attachment = { name: "foto.jpg", contentType: "image/jpeg", base64: "/9j/" };
    await (
      await handlers("work")
    ).POST!({
      request: post({ action: "submit", taskId: TASK, body: "   ", attachment }),
    });
    expect(fns.submitTaskWork).toHaveBeenCalledWith({ data: { taskId: TASK, attachment } });
  });

  it("acção desconhecida ou corpo inválido: 422 sem chamar o portal", async () => {
    const h = await handlers("work");
    expect((await h.POST!({ request: post({ action: "delete", taskId: TASK }) })).status).toBe(422);
    expect((await h.POST!({ request: post("não é json") })).status).toBe(422);
    expect(fns.submitTaskWork).not.toHaveBeenCalled();
  });

  it("recusa do portal (ex.: prazo terminado) chega à app com o texto", async () => {
    fns.submitTaskWork.mockRejectedValue(
      new Error("O prazo terminou e esta tarefa não aceita entregas atrasadas."),
    );
    const res = await (
      await handlers("work")
    ).POST!({
      request: post({ action: "submit", taskId: TASK, body: "x" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "REJECTED",
      message: "O prazo terminou e esta tarefa não aceita entregas atrasadas.",
    });
  });
});
