import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_LOCAL_RATE_LIMIT_KEYS,
  checkRateLimit,
  recordRateLimitAttempt,
} from "@/lib/rate-limit";

afterEach(() => vi.useRealTimers());

describe("fallback local do rate limiting", () => {
  it("mantém os limites existentes e renova depois de expirar a janela", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    const key = "security-fallback-window-20261102";
    const options = { windowMs: 1000, max: 2 };

    expect(checkRateLimit([key], options)).toBe(true);
    recordRateLimitAttempt([key], options);
    recordRateLimitAttempt([key], options);
    expect(checkRateLimit([key], options)).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(checkRateLimit([key], options)).toBe(true);
  });

  it("não conta uma chave repetida duas vezes no mesmo pedido", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T13:00:00Z"));
    const key = "security-fallback-duplicate-20261102";
    const options = { windowMs: 60_000, max: 2 };

    expect(checkRateLimit([key, key], options)).toBe(true);
    recordRateLimitAttempt([key, key], options);
    expect(checkRateLimit([key], options)).toBe(true);
    recordRateLimitAttempt([key], options);
    expect(checkRateLimit([key], options)).toBe(false);
  });

  it("recusa tentativas sem chave em vez de permitir bypass por erro do chamador", () => {
    expect(checkRateLimit([], { windowMs: 60_000, max: 5 })).toBe(false);
  });

  it("recusa configuração inválida em vez de permitir tentativas ilimitadas", () => {
    expect(checkRateLimit(["invalid-config"], { windowMs: 0, max: 5 })).toBe(false);
    expect(checkRateLimit(["invalid-config"], { windowMs: 1000, max: 0 })).toBe(false);
  });

  it("não cresce sem limite quando há muitas chaves distintas e liberta as expiradas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T14:00:00Z"));
    const keys = Array.from(
      { length: MAX_LOCAL_RATE_LIMIT_KEYS },
      (_, i) => `security-fallback-capacity-${i}`,
    );
    const options = { windowMs: 1000, max: 2 };

    recordRateLimitAttempt(keys, options);
    expect(checkRateLimit(["security-fallback-over-capacity"], options)).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(["security-fallback-over-capacity"], options)).toBe(true);
  });
});
