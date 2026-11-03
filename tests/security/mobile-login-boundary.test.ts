import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signInWithIdentifierFn: vi.fn() }));
vi.mock("@/features/access/server", () => mocks);

async function login(body: unknown) {
  const { Route } = await import("@/routes/api/mobile/login");
  const handlers = (
    Route.options as unknown as {
      server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } };
    }
  ).server.handlers;
  return handlers.POST({
    request: new Request("https://escola.portal-siga.com/api/mobile/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  });
}

beforeEach(() => mocks.signInWithIdentifierFn.mockReset());

describe("fronteira HTTP da autenticação móvel", () => {
  it("não permite armazenar respostas com tokens", async () => {
    mocks.signInWithIdentifierFn.mockResolvedValue({
      ok: true,
      accessToken: "token-de-teste",
      refreshToken: "refresh-de-teste",
    });
    const result = await login({ identifier: "aluno", password: "senha-de-teste" });
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejeita corpos maiores que 16 KiB sem chamar a autenticação", async () => {
    const result = await login({ identifier: "a".repeat(17_000), password: "x" });
    expect(result.status).toBe(413);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.json()).toEqual({ error: "payload_too_large" });
    expect(mocks.signInWithIdentifierFn).not.toHaveBeenCalled();
  });

  it("não permite armazenar respostas de credenciais inválidas", async () => {
    mocks.signInWithIdentifierFn.mockResolvedValue({
      ok: false,
      error: "invalid_credentials",
    });
    const result = await login({ identifier: "aluno", password: "invalida" });
    expect(result.status).toBe(401);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });
});
