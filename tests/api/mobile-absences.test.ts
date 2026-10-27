import { beforeEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({ getMyAbsencesBySubject: vi.fn() }));
vi.mock("@/features/dashboard/student-absences", () => ({
  getMyAbsencesBySubject: fns.getMyAbsencesBySubject,
}));

type Handler = (ctx: { request: Request }) => Promise<Response>;
async function handlers() {
  const { Route } = await import("@/routes/api/mobile/absences");
  return (Route.options as unknown as { server: { handlers: Record<string, Handler> } }).server
    .handlers;
}
const get = (path: string) =>
  new Request(`https://portal-siga.com${path}`, { headers: { Authorization: "Bearer t" } });
const STUDENT = "00000000-0000-0000-0000-0000000000c1";

beforeEach(() => {
  fns.getMyAbsencesBySubject.mockReset();
});

describe("/api/mobile/absences", () => {
  it("sem student_id é o próprio aluno; com ele, o educando", async () => {
    const summary = { limitPercentage: 25, subjects: [], totals: { lessons: 0 } };
    fns.getMyAbsencesBySubject.mockResolvedValue(summary);
    const h = await handlers();
    expect(await (await h.GET!({ request: get("/api/mobile/absences") })).json()).toEqual(summary);
    expect(fns.getMyAbsencesBySubject).toHaveBeenLastCalledWith({ data: {} });
    await h.GET!({ request: get(`/api/mobile/absences?student_id=${STUDENT}`) });
    expect(fns.getMyAbsencesBySubject).toHaveBeenLastCalledWith({ data: { studentId: STUDENT } });
  });

  it("sem sessão: 401", async () => {
    fns.getMyAbsencesBySubject.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    );
    const res = await (await handlers()).GET!({ request: get("/api/mobile/absences") });
    expect(res.status).toBe(401);
  });
});
