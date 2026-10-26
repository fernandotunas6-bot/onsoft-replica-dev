import { beforeEach, describe, expect, it, vi } from "vitest";

/** As rotas são as funções do portal: a app recebe o mesmo que o painel do aluno. */
const fns = vi.hoisted(() => ({ getMyStudentAgenda: vi.fn(), getMyWorkOverview: vi.fn() }));
vi.mock("@/features/dashboard/student-agenda", () => ({
  getMyStudentAgenda: fns.getMyStudentAgenda,
}));
vi.mock("@/features/academic/subject-work-server", () => ({
  getMyWorkOverview: fns.getMyWorkOverview,
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

beforeEach(() => {
  fns.getMyStudentAgenda.mockReset();
  fns.getMyWorkOverview.mockReset();
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
});
