import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headers = new Headers();
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://x.test", { headers }),
}));

const { serverFnClientIp } = await import("@/lib/server-fn-ip");

beforeEach(() => {
  headers.delete("x-forwarded-for");
  headers.delete("x-real-ip");
  headers.delete("cf-connecting-ip");
});
afterEach(() => vi.unstubAllEnvs());

/** CF é o ponto de confiança do Worker; headers enviados pelo cliente não são. */
describe("IP para os limites de tentativas", () => {
  it("usa o endereço validado da Cloudflare, não o X-Forwarded-For", () => {
    vi.stubEnv("NODE_ENV", "production");
    headers.set("x-forwarded-for", "1.2.3.4, 41.63.0.9");
    headers.set("cf-connecting-ip", "41.63.0.9");
    expect(serverFnClientIp()).toBe("41.63.0.9");
  });

  it("não permite contornar rate limiting com XFF ou X-Real-IP em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    headers.set("x-forwarded-for", "1.2.3.4, 41.63.0.9");
    headers.set("x-real-ip", "2.3.4.5");
    expect(serverFnClientIp()).toBe("unknown");
    headers.set("cf-connecting-ip", "malformed");
    expect(serverFnClientIp()).toBe("unknown");
  });

  it("mantém fallback de proxy para desenvolvimento local", () => {
    vi.stubEnv("NODE_ENV", "development");
    headers.set("x-forwarded-for", "1.2.3.4, 41.63.0.9");
    expect(serverFnClientIp()).toBe("1.2.3.4");
  });

  it("nenhuma server function volta a usar directamente o XFF não confiável", () => {
    const source = readFileSync("src/lib/server-fn-ip.ts", "utf8");
    expect(source).not.toContain("getRequestIP({ xForwardedFor: true })");
    expect(source).toContain("clientIpFromRequest(request)");
  });

  it("os pedidos e a verificação genéricos de OTP, públicos, já não existem", () => {
    expect(() => readFileSync("src/features/otp/server.ts")).toThrow();
  });
});

describe("repor a senha por OTP", () => {
  it("tem tecto por conta e por IP antes de verificar o código", () => {
    const source = readFileSync("src/features/auth/reset-password-otp-server.ts", "utf8");
    const handler = source.slice(source.indexOf("export const resetPasswordWithOtpFn"));
    const limit = handler.indexOf("RESET_OTP_TRIES_PER_ACCOUNT");
    expect(limit).toBeGreaterThan(-1);
    expect(handler).toContain("RESET_OTP_TRIES_PER_IP");
    expect(limit).toBeLessThan(handler.indexOf("OtpService.verifyCode("));
  });
});
