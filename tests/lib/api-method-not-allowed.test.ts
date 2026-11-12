import { describe, expect, it } from "vitest";
import { apiMethodNotAllowed } from "@/lib/api-method-not-allowed";

const html = () =>
  new Response("<!DOCTYPE html><html></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
const req = (method: string, path: string) =>
  new Request(`https://portal-siga.com${path}`, { method });

describe("métodos sem handler nas rotas /api", () => {
  it("POST que cai na página da aplicação passa a 405 JSON", async () => {
    const res = apiMethodNotAllowed(req("POST", "/api/mobile/agenda"), html());
    expect(res?.status).toBe(405);
    expect(await res?.json()).toEqual({ error: "METHOD_NOT_ALLOWED" });
  });

  it("não mexe em GET, em respostas JSON, em erros nem fora de /api", () => {
    expect(apiMethodNotAllowed(req("GET", "/api/saas/signup"), html())).toBeNull();
    expect(apiMethodNotAllowed(req("HEAD", "/api/mobile/agenda"), html())).toBeNull();
    expect(
      apiMethodNotAllowed(req("POST", "/api/mobile/work"), Response.json({ ok: true })),
    ).toBeNull();
    expect(
      apiMethodNotAllowed(
        req("POST", "/api/x"),
        new Response("<html>", { status: 404, headers: { "content-type": "text/html" } }),
      ),
    ).toBeNull();
    expect(apiMethodNotAllowed(req("POST", "/configuracoes"), html())).toBeNull();
  });
});
