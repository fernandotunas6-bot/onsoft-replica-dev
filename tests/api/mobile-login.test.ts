import { beforeEach, describe, expect, it, vi } from "vitest";

/** A rota é o `signInWithIdentifierFn` do portal: mesmos limites, mesmas respostas. */
const fns = vi.hoisted(() => ({ signInWithIdentifierFn: vi.fn() }));
vi.mock("@/features/access/server", () => fns);

type Handler = (ctx: { request: Request }) => Promise<Response>;
async function handlers() {
  const { Route } = await import("@/routes/api/mobile/login");
  return (Route.options as unknown as { server: { handlers: Record<string, Handler> } }).server
    .handlers;
}
const post = (body: unknown) =>
  new Request("https://escola-um.portal-siga.com/api/mobile/login", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => fns.signInWithIdentifierFn.mockReset());

describe("/api/mobile/login", () => {
  it("passa identificador, senha e captcha; devolve o par de tokens", async () => {
    fns.signInWithIdentifierFn.mockResolvedValue({
      ok: true,
      accessToken: "acesso",
      refreshToken: "renovação",
    });
    const res = await (
      await handlers()
    ).POST!({
      request: post({ identifier: "1260001", password: "KMPT-4827-ra", captcha_token: "c" }),
    });
    expect(fns.signInWithIdentifierFn).toHaveBeenCalledWith({
      data: { identifier: "1260001", password: "KMPT-4827-ra", captchaToken: "c" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: "acesso", refresh_token: "renovação" });
  });

  it("conta desconhecida ou senha errada: 401 com o código, sem dizer qual", async () => {
    fns.signInWithIdentifierFn.mockResolvedValue({ ok: false, error: "invalid_credentials" });
    const res = await (
      await handlers()
    ).POST!({ request: post({ identifier: "1260001", password: "x" }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("limite de tentativas: 429; servidor sem configuração: 503", async () => {
    const h = await handlers();
    fns.signInWithIdentifierFn.mockResolvedValue({ ok: false, error: "rate_limited" });
    expect((await h.POST!({ request: post({ identifier: "a@b.ao", password: "x" }) })).status).toBe(
      429,
    );
    fns.signInWithIdentifierFn.mockResolvedValue({ ok: false, error: "unavailable" });
    expect((await h.POST!({ request: post({ identifier: "a@b.ao", password: "x" }) })).status).toBe(
      503,
    );
  });

  it("corpo vazio ou malformado vai ao SIGA tal como veio: é o esquema dele que valida", async () => {
    fns.signInWithIdentifierFn.mockResolvedValue({ ok: false, error: "invalid_credentials" });
    const h = await handlers();
    await h.POST!({
      request: new Request("https://escola-um.portal-siga.com/api/mobile/login", {
        method: "POST",
        body: "não é json",
      }),
    });
    expect(fns.signInWithIdentifierFn).toHaveBeenCalledWith({
      data: { identifier: undefined, password: undefined },
    });
  });
});
