import { beforeEach, describe, expect, it, vi } from "vitest";

const signup = vi.hoisted(() => ({ runPublicSchoolSignup: vi.fn() }));
vi.mock("@/features/saas/public-signup", () => signup);

const valid = {
  name: "Escola Exemplo",
  nif: "5417000000",
  slug: "escola-exemplo",
  contact_name: "Responsável",
  contact_email: "responsavel@escola.ao",
  plan_code: "start",
  admin_name: "Administrador",
  admin_email: "administrador@escola.ao",
  admin_password: "SenhaForte2026",
  website: "",
};

async function postSignup(body: string) {
  const { Route } = await import("@/routes/api/saas/signup");
  const handlers = (
    Route.options as unknown as {
      server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } };
    }
  ).server.handlers;
  return handlers.POST({
    request: new Request("https://portal-siga.com/api/saas/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  });
}

beforeEach(() => signup.runPublicSchoolSignup.mockReset());

describe("fronteira pública da criação de escolas", () => {
  it("aceita o contrato existente sem permitir cache do resultado", async () => {
    signup.runPublicSchoolSignup.mockResolvedValue({
      success: true,
      tenantId: "11111111-1111-1111-1111-111111111111",
      slug: "escola-exemplo",
      hostname: "escola-exemplo.portal-siga.com",
      bootstrapSeeded: [],
      adminInviteDelivered: false,
      adminPasswordSet: true,
      adminExistingAccount: false,
      adminLoginUrl: null,
    });

    const result = await postSignup(JSON.stringify(valid));
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect((await result.json()).success).toBe(true);
    expect(signup.runPublicSchoolSignup).toHaveBeenCalledTimes(1);
  });

  it("rejeita payload demasiado grande antes de provisionar qualquer tenant", async () => {
    const result = await postSignup(JSON.stringify({ ...valid, name: "A".repeat(140_000) }));
    expect(result.status).toBe(413);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(signup.runPublicSchoolSignup).not.toHaveBeenCalled();
  });

  it("rejeita JSON inválido com a resposta existente, sem cache", async () => {
    const result = await postSignup("{não é JSON");
    expect(result.status).toBe(400);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.json()).toEqual({ error: "Corpo JSON inválido." });
    expect(signup.runPublicSchoolSignup).not.toHaveBeenCalled();
  });

  it("rejeita campos inválidos antes da operação de escrita", async () => {
    const result = await postSignup(JSON.stringify({ ...valid, admin_email: "invalido" }));
    expect(result.status).toBe(400);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(signup.runPublicSchoolSignup).not.toHaveBeenCalled();
  });

  it("preserva rate limiting de negócio e impede cache do erro", async () => {
    signup.runPublicSchoolSignup.mockRejectedValue(new Error("Muitos pedidos recentes"));
    const result = await postSignup(JSON.stringify(valid));
    expect(result.status).toBe(429);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });
});
