import { beforeEach, describe, expect, it, vi } from "vitest";

/** A rota passa o lançamento à função do SIGA (upsertTermGradesBatch). */
const fns = vi.hoisted(() => ({ upsertTermGradesBatch: vi.fn() }));
vi.mock("@/features/academic/server", () => fns);

type Handler = (ctx: { request: Request }) => Promise<Response>;
async function post(body: unknown) {
  const { Route } = await import("@/routes/api/mobile/grades");
  const handlers = (Route.options as unknown as { server: { handlers: Record<string, Handler> } })
    .server.handlers;
  return handlers.POST!({
    request: new Request("https://portal-siga.com/api/mobile/grades", {
      method: "POST",
      headers: { Authorization: "Bearer t", Origin: "https://m.portal-siga.com" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  });
}

beforeEach(() => {
  fns.upsertTermGradesBatch.mockReset();
});

describe("/api/mobile/grades", () => {
  it("traduz os campos para os do SIGA", async () => {
    fns.upsertTermGradesBatch.mockResolvedValue({ saved: 1 });
    const res = await post({
      subject_id: "sub",
      term: 2,
      rows: [{ enrollment_id: "e1", mac: 12, npp: 10, npt: 14 }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 1 });
    expect(fns.upsertTermGradesBatch).toHaveBeenCalledWith({
      data: {
        subjectId: "sub",
        term: 2,
        rows: [{ enrollmentId: "e1", mac: 12, npp: 10, npt: 14 }],
      },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://m.portal-siga.com");
  });

  it("recusa do SIGA com o texto; corpo inválido 422", async () => {
    fns.upsertTermGradesBatch.mockImplementation(async () => {
      throw new Error("A pauta deste período já é oficial: peça a alteração.");
    });
    const res = await post({ subject_id: "s", term: 1, rows: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "REJECTED",
      message: "A pauta deste período já é oficial: peça a alteração.",
    });
    expect((await post("x")).status).toBe(422);
    expect((await post({ subject_id: "s" })).status).toBe(422);
  });
});
