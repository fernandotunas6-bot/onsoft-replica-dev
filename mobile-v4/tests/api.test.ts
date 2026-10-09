import { afterEach, it, expect, vi } from "vitest";
import { ApiGateway } from "../src/services/api";
import { demoSession, seed } from "../src/services/demo";
const ctx = {
  userId: "demo-teacher",
  schoolId: "demo-a",
  role: "professor" as const,
};
afterEach(() => vi.unstubAllGlobals());
it("reads a fresh Supabase token for each request without storing it", async () => {
  const accessToken = vi.fn().mockResolvedValueOnce("token-a").mockResolvedValueOnce("token-b");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => demoSession("professor") })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => seed(ctx.schoolId) });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway("/api/mobile-v4", { accessToken });
  await api.session();
  await api.workspace(ctx);
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer token-a");
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer token-b");
});
it("refuses a missing session token before contacting the API", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway("/api/mobile-v4", { accessToken: async () => null });
  await expect(api.session()).rejects.toThrow("Sessão expirada");
  expect(fetch).not.toHaveBeenCalled();
});
it("preserves the request ID when retrying an ambiguous network failure", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => demoSession("professor") })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => seed(ctx.schoolId) })
    .mockRejectedValueOnce(new TypeError("Network interrupted"))
    .mockResolvedValueOnce({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  await api.workspace(ctx);
  const command = { type: "message" as const, to: "demo-student", text: "Test retry" };
  await expect(api.execute(ctx, command)).rejects.toThrow("Network interrupted");
  await api.execute(ctx, command);
  const first = JSON.parse(fetch.mock.calls[2][1].body);
  const retry = JSON.parse(fetch.mock.calls[3][1].body);
  expect(retry.requestId).toBe(first.requestId);
});
it("clears the local Supabase session even when remote logout fails", async () => {
  const clearSession = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network interrupted")));
  const api = new ApiGateway("/api/mobile-v4", { accessToken: async () => "token", clearSession });
  await expect(api.signOut()).rejects.toThrow();
  expect(clearSession).toHaveBeenCalledTimes(1);
});
it("refuses external API bases", () => {
  expect(() => new ApiGateway("https://example.com")).toThrow();
  expect(() => new ApiGateway("//example.com")).toThrow();
  expect(() => new ApiGateway("/api/mobile-v4?redirect=other")).toThrow();
  expect(() => new ApiGateway("/api/mobile-v4#fragment")).toThrow();
  expect(() => new ApiGateway("/api/../mobile-v4")).toThrow();
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ secret: "never show this" }),
      }),
    );
    await expect(new ApiGateway().session()).rejects.toThrow(expected);
  });
}

it("rejects unrecognised membership roles in API session", async () => {
  const session = demoSession("professor");
  const invalid = {
    ...session,
    memberships: [{ ...session.memberships[0], roles: ["administrador"] }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => invalid,
    }),
  );
  await expect(new ApiGateway().session()).rejects.toThrow("Contrato de sessão inválido");
});

it("rejects incomplete academic workspace responses", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => demoSession("professor") })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ schoolId: ctx.schoolId, classes: [] }),
    });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  await expect(api.workspace(ctx)).rejects.toThrow("Contrato académico inválido");
});

it("rejects malformed imported chat thread collections", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => demoSession("professor") })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...seed(ctx.schoolId),
        sigaDirectThreads: { invalid: true },
      }),
    });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  await expect(api.workspace(ctx)).rejects.toThrow("Contrato de mensagens inválido");
});

it("rejects unknown permission strings from the institutional session", async () => {
  const session = demoSession("professor");
  const invalid = {
    ...session,
    memberships: [{ ...session.memberships[0], permissions: ["academic.read", "admin.all"] }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => invalid,
    }),
  );
  await expect(new ApiGateway().session()).rejects.toThrow("Contrato de sessão inválido");
});

it("rejects an institutional session without a user name", async () => {
  const session = { ...demoSession("professor"), name: "   " };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => session,
    }),
  );
  await expect(new ApiGateway().session()).rejects.toThrow("Contrato de sessão inválido");
});

it("blocks institutional writes before loading an authorised workspace", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => demoSession("professor"),
  });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  await expect(
    api.execute(ctx, {
      type: "grade",
      classId: "not-authorised",
      studentId: "unknown",
      value: 15,
      published: true,
      expectedRevision: 0,
    }),
  ).rejects.toThrow("Actualize os dados");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("rejects an invalid command without contacting the write endpoint", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => demoSession("professor") })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => seed(ctx.schoolId) });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  await api.workspace(ctx);
  await expect(
    api.execute(ctx, {
      type: "grade",
      classId: "not-authorised",
      studentId: "unknown",
      value: 15,
      published: true,
      expectedRevision: 0,
    }),
  ).rejects.toThrow("Turma não autorizada");
  expect(fetch).toHaveBeenCalledTimes(2);
});
