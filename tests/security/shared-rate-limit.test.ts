import { describe, expect, it, vi } from "vitest";
import { consumeRateLimit } from "@/lib/shared-rate-limit";

describe("limite de tentativas partilhado", () => {
  it("usa o contador da base com chaves em hash (SHA-256)", async () => {
    const consume = vi.fn(async () => true);
    expect(
      await consumeRateLimit(["bi_lookup:1.2.3.4"], { windowMs: 60_000, max: 10 }, consume),
    ).toBe(true);
    const [hashes, windowSeconds, max] = consume.mock.calls[0] as unknown as [
      string[],
      number,
      number,
    ];
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes[0]).not.toContain("1.2.3.4");
    expect([windowSeconds, max]).toEqual([60, 10]);
  });

  it("deduplica chaves antes da RPC para evitar bloqueios e contagens repetidos", async () => {
    const consume = vi.fn(async () => true);
    const options = { windowMs: 1000, max: 2 };
    expect(await consumeRateLimit(["ip:41.63.0.9", "ip:41.63.0.9"], options, consume)).toBe(
      true,
    );
    expect(consume).toHaveBeenCalledTimes(1);
    const hashes = consume.mock.calls[0][0] as string[];
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    { windowMs: 0, max: 10 },
    { windowMs: -10, max: 10 },
    { windowMs: Number.NaN, max: 10 },
    { windowMs: 1000.5, max: 10 },
    { windowMs: 60_000, max: 0 },
    { windowMs: 60_000, max: -1 },
    { windowMs: 60_000, max: Number.POSITIVE_INFINITY },
    { windowMs: 60_000, max: 2_147_483_648 },
    { windowMs: 2_147_483_648_000, max: 10 },
  ])("recusa configuração inválida antes de chegar à RPC: %o", async (options) => {
    const consume = vi.fn(async () => true);
    expect(await consumeRateLimit(["ip:41.63.0.9"], options, consume)).toBe(false);
    expect(consume).not.toHaveBeenCalled();
  });

  it("respeita a recusa da base", async () => {
    expect(await consumeRateLimit(["k"], { windowMs: 1000, max: 1 }, async () => false)).toBe(
      false,
    );
  });

  it("regista uma falha partilhada sem PII, no máximo uma vez por cinco minutos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const key = "ip:41.63.0.9 email:private@example.com";
      const opts = { windowMs: 60_000, max: 8 };
      const unavailable = async () => null;
      await consumeRateLimit([key], opts, unavailable);
      await consumeRateLimit([key], opts, unavailable);
      const fallbackWarnings = () =>
        warn.mock.calls.filter(([event]) => event === "security.rate_limit.shared_unavailable");
      expect(fallbackWarnings()).toHaveLength(1);
      expect(JSON.stringify(fallbackWarnings())).not.toContain("41.63.0.9");
      expect(JSON.stringify(fallbackWarnings())).not.toContain("private@example.com");
      expect(JSON.stringify(fallbackWarnings())).not.toContain("ip:");

      vi.advanceTimersByTime(5 * 60_000 + 1);
      await consumeRateLimit([key], opts, unavailable);
      expect(fallbackWarnings()).toHaveLength(2);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("não emite alerta quando o contador partilhado responde", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const opts = { windowMs: 60_000, max: 2 };
      await consumeRateLimit(["key-allowed"], opts, async () => true);
      await consumeRateLimit(["key-denied"], opts, async () => false);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("sem a base, cai no limite em memória (nunca fica sem limite)", async () => {
    const unavailable = async () => null;
    const key = `fallback-${Math.random()}`;
    const opts = { windowMs: 60_000, max: 2 };
    expect(await consumeRateLimit([key], opts, unavailable)).toBe(true);
    expect(await consumeRateLimit([key], opts, unavailable)).toBe(true);
    expect(await consumeRateLimit([key], opts, unavailable)).toBe(false);
  });
});

describe("operações públicas usam o limite partilhado entre instâncias", () => {
  it.each([
    "src/features/access/server.ts",
    "src/features/otp/otp-dispatcher.ts",
    "src/features/saas/public-signup.ts",
    "src/features/documents/verification.ts",
  ])("%s", async (file) => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(file, "utf8")).toMatch(/consumeRateLimit\(/);
  });

  it("o envio de OTP já não conta só em memória", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/features/otp/otp-dispatcher.ts", "utf8");
    expect(source).not.toMatch(/checkRateLimit\(|recordRateLimitAttempt\(/);
  });
});
