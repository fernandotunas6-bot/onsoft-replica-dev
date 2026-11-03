import { describe, expect, it } from "vitest";
import { readJsonBodyLimited } from "@/lib/read-json-body";

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
