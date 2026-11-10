import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIpFromRequest, validClientIp } from "@/lib/request-ip";

afterEach(() => vi.unstubAllEnvs());

function request(headers: Record<string, string>): Request {
  return new Request("https://portal-siga.com/api/saas/signup", { headers });
}

describe("validação da identidade de rede para rate limiting", () => {
  it.each([
    ["41.63.0.9", "41.63.0.9"],
    ["0.0.0.0", "0.0.0.0"],
    ["255.255.255.255", "255.255.255.255"],
    ["2001:db8::1", "2001:db8::1"],
    ["::1", "::1"],
    ["::ffff:192.0.2.1", "::ffff:c000:201"],
  ])("valida endereço IP %s", (input, expected) => {
    expect(validClientIp(input)).toBe(expected);
  });

  it.each([
    "",
    "unknown",
    "1.2.3.4, 5.6.7.8",
    "256.1.2.3",
    "1.2.3",
    "01.2.3.4",
    "1.2.3.4:8080",
    "1.2.3.4 ",
    "[2001:db8::1]",
    "fe80::1%eth0",
    "127.0.0.1; DROP",
    "x".repeat(80),
  ])("descarta IP inválido %s", (input) => {
    expect(validClientIp(input)).toBeNull();
  });

  it("em produção usa CF-Connecting-IP e ignora o XFF manipulado", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      clientIpFromRequest(
        request({
          "cf-connecting-ip": "41.63.0.9",
          "x-forwarded-for": "1.2.3.4, 41.63.0.9",
          "x-real-ip": "9.9.9.9",
        }),
      ),
    ).toBe("41.63.0.9");
  });

  it("não aceita XFF nem X-Real-IP em produção se CF estiver ausente ou inválido", () => {
    vi.stubEnv("NODE_ENV", "production");
    const attackerHeaders = { "x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9" };
    expect(clientIpFromRequest(request(attackerHeaders))).toBe("unknown");
    expect(
      clientIpFromRequest(request({ ...attackerHeaders, "cf-connecting-ip": "bad-value" })),
    ).toBe("unknown");
  });

  it("não confia em cabeçalhos encaminhados quando NODE_ENV não foi definido", () => {
    vi.stubEnv("NODE_ENV", "");
    expect(clientIpFromRequest(request({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
  });

  it("mantém fallback para testes locais com IP válido", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(clientIpFromRequest(request({ "x-forwarded-for": "1.2.3.4, 41.63.0.9" }))).toBe(
      "1.2.3.4",
    );
    expect(clientIpFromRequest(request({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIpFromRequest(request({ "x-forwarded-for": "malformed" }))).toBe("unknown");
  });
});
