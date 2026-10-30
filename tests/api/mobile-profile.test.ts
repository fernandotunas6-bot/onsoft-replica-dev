import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** A rota usa as funções de perfil do SIGA e devolve só o que o ecrã usa. */
const fns = vi.hoisted(() => ({
  getCurrentAccountContext: vi.fn(),
  updateCurrentProfile: vi.fn(),
}));
vi.mock("@/features/auth/server", () => fns);

type Handler = (ctx: { request: Request }) => Promise<Response>;
async function handlers() {
  const { Route } = await import("@/routes/api/mobile/profile");
  return (Route.options as unknown as { server: { handlers: Record<string, Handler> } }).server
    .handlers;
}
const req = (init: RequestInit = {}) =>
  new Request("https://portal-siga.com/api/mobile/profile", {
    ...init,
    headers: { Authorization: "Bearer t" },
  });

beforeEach(() => {
  fns.getCurrentAccountContext.mockReset();
  fns.updateCurrentProfile.mockReset();
});

describe("/api/mobile/profile", () => {
  it("GET devolve só nome, telefone, versão e escola", async () => {
    fns.getCurrentAccountContext.mockResolvedValue({
      full_name: "Mariana Silva",
      phone: "+244923000000",
      updated_at: "2026-10-01T10:00:00Z",
      school_name: "Escola Um",
      roles: ["Encarregado"],
      grants: { x: 1 },
      linkedEntities: { linked_students: [{ student_id: "s" }] },
    });
    const res = await (await handlers()).GET!({ request: req() });
    expect(await res.json()).toEqual({
      full_name: "Mariana Silva",
      phone: "+244923000000",
      updated_at: "2026-10-01T10:00:00Z",
      school_name: "Escola Um",
    });
  });

  it("POST passa nome, telefone e versão; telefone inválido traz o texto do SIGA", async () => {
    fns.updateCurrentProfile.mockResolvedValue({ full_name: "Mariana S.", updated_at: "2" });
    const h = await handlers();
    const body = { full_name: "Mariana S.", phone: "923000000", expected_updated_at: "1" };
    await h.POST!({ request: req({ method: "POST", body: JSON.stringify(body) }) });
    expect(fns.updateCurrentProfile).toHaveBeenCalledWith({
      data: { fullName: "Mariana S.", phone: "923000000", expectedUpdatedAt: "1" },
    });

    fns.updateCurrentProfile.mockImplementation(async () => {
      z.object({
        phone: z
          .string()
          .refine(() => false, { message: "Telefone inválido. Use +244 9XX XXX XXX." }),
      }).parse({ phone: "1" });
    });
    const res = await h.POST!({ request: req({ method: "POST", body: JSON.stringify(body) }) });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "INVALID_INPUT",
      message: "Telefone inválido. Use +244 9XX XXX XXX.",
    });
  });

  it("conflito (alterado noutro aparelho) com o texto do SIGA", async () => {
    fns.updateCurrentProfile.mockImplementation(async () => {
      throw new Error(
        "O perfil foi alterado noutro dispositivo. Actualize a página e tente novamente.",
      );
    });
    const res = await (
      await handlers()
    ).POST!({
      request: req({
        method: "POST",
        body: JSON.stringify({ full_name: "X Y", expected_updated_at: "1" }),
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/alterado noutro dispositivo/);
  });
});
