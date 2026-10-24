import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

const headers = new Headers();
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://x.test", { headers }),
  getRequestIP: () => headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
}));

const { serverFnClientIp } = await import("@/lib/server-fn-ip");

/**
 * O primeiro valor de X-Forwarded-For vem do cliente: mudando-o a cada pedido, os
 * limites por IP (OTP, entrar, repor a senha) não contavam nada.
 */
describe("IP para os limites de tentativas", () => {
  it("usa o IP da Cloudflare, não o X-Forwarded-For do cliente", () => {
    headers.set("x-forwarded-for", "1.2.3.4, 41.63.0.9");
    headers.set("cf-connecting-ip", "41.63.0.9");
    expect(serverFnClientIp()).toBe("41.63.0.9");
  });

  it("nenhuma server function lê o X-Forwarded-For directamente", () => {
    const hits = execSync("grep -rln 'xForwardedFor: true' src || true", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(hits).toEqual(["src/lib/server-fn-ip.ts"]);
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
