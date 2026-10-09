import { afterEach, it, expect, vi } from "vitest";
import { ApiGateway } from "../src/services/api";
import { demoSession, seed } from "../src/services/demo";
const ctx = {
  userId: "demo-teacher",
  schoolId: "demo-a",
  role: "professor" as const,
};
afterEach(() => vi.unstubAllGlobals());
it("refuses external API bases", () => {
  expect(() => new ApiGateway("https://example.com")).toThrow();
  expect(() => new ApiGateway("//example.com")).toThrow();
});
it("uses same-origin credentials and disables response cache", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => demoSession("professor"),
  });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  expect(fetch.mock.calls[0][1].credentials).toBe("same-origin");
  expect(fetch.mock.calls[0][1].cache).toBe("no-store");
});
it("rejects another school payload and malformed session", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => demoSession("professor"),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => seed("demo-b"),
    });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  await expect(api.workspace(ctx)).rejects.toThrow("outra escola");
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ userId: "x", memberships: null }),
  });
  await expect(api.session()).rejects.toThrow("inválido");
});
it("fails closed on unauthorized writes without calling backend", async () => {
  const s = demoSession("professor");
  s.memberships[0].permissions = ["academic.read"];
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => s });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  await expect(
    api.execute(ctx, {
      type: "plan",
      lessonId: "x",
      objectives: "x",
      materials: "",
    }),
  ).rejects.toThrow("permissão");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("401 reports expired session without exposing response contents", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => ({ secret: "x" }),
    }),
  );
  await expect(new ApiGateway().session()).rejects.toThrow("Sessão expirada");
});

for (const [status, expected] of [
  [403, "Sem autorização"],
  [409, "Actualize antes"],
  [422, "validação institucional"],
] as const) {
  it(`reports API HTTP ${status} without leaking response body`, async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ secret: "never show this" }),
    }));
    await expect(new ApiGateway().session()).rejects.toThrow(expected);
  });
}
