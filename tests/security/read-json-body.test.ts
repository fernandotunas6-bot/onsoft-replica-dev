import { describe, expect, it } from "vitest";
import { readJsonBodyLimited, readTextBodyLimited, rejectedBody } from "@/lib/read-json-body";

function requestWithBody(body: string, headers?: Record<string, string>) {
  return new Request("https://escola.portal-siga.com/api/mobile/login", {
    method: "POST",
    body,
    headers,
  });
}

describe("JSON de entrada pública com limite efectivo de bytes", () => {
  it("lê um objecto pequeno sem modificar os valores", async () => {
    expect(
      await readJsonBodyLimited(requestWithBody('{"identifier":"123","password":"abc"}'), 256),
    ).toEqual({ ok: true, value: { identifier: "123", password: "abc" } });
  });

  it("rejeita corpo acima do limite mesmo sem Content-Length", async () => {
    const result = await readJsonBodyLimited(requestWithBody("x".repeat(100)), 32);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejeita também Content-Length declarado maior, antes de consumir o corpo", async () => {
    const result = await readJsonBodyLimited(
      requestWithBody("{}", { "content-length": "99999" }),
      32,
    );
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("não confia num Content-Length subdeclarado", async () => {
    expect(
      await readJsonBodyLimited(requestWithBody("x".repeat(100), { "content-length": "2" }), 32),
    ).toEqual({ ok: false, reason: "too_large" });
  });

  it("aceita o limite exacto e rejeita JSON malformado", async () => {
    expect(await readJsonBodyLimited(requestWithBody("{}"), 2)).toEqual({
      ok: true,
      value: {},
    });
    expect(await readJsonBodyLimited(requestWithBody("{"), 20)).toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });

  it("rejeita pedidos sem corpo e configuração inválida", async () => {
    const empty = new Request("https://escola.portal-siga.com/api/mobile/login", {
      method: "POST",
    });
    expect(await readJsonBodyLimited(empty, 10)).toEqual({ ok: false, reason: "invalid_json" });
    await expect(readJsonBodyLimited(requestWithBody("{}"), 0)).rejects.toThrow(RangeError);
  });
});

describe("texto de webhooks com limite efectivo de bytes", () => {
  it("devolve o texto exacto, como o request.text()", async () => {
    const raw = '{ "a": 1,  "nome": "São Tomé" }\n';
    expect(await readTextBodyLimited(requestWithBody(raw), 1024)).toEqual({ ok: true, text: raw });
  });

  it("não falha em bytes UTF-8 inválidos (a assinatura decide), como o request.text()", async () => {
    const bytes = new Uint8Array([0x7b, 0xff, 0x7d]);
    const request = new Request("https://escola.portal-siga.com/api/x", {
      method: "POST",
      body: bytes,
    });
    const expected = await new Request("https://x.test", { method: "POST", body: bytes }).text();
    expect(await readTextBodyLimited(request, 16)).toEqual({ ok: true, text: expected });
  });

  it("corpo vazio é texto vazio; acima do limite é too_large", async () => {
    const empty = new Request("https://escola.portal-siga.com/api/x", { method: "POST" });
    expect(await readTextBodyLimited(empty, 8)).toEqual({ ok: true, text: "" });
    expect(await readTextBodyLimited(requestWithBody("x".repeat(9)), 8)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("413 para corpo grande, 400 para o resto", () => {
    expect(rejectedBody("too_large")).toEqual({ status: 413, message: "Pedido demasiado grande." });
    expect(rejectedBody("invalid_json")).toEqual({ status: 400, message: "Corpo JSON inválido." });
    expect(rejectedBody("unreadable").status).toBe(400);
  });
});
