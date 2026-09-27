import { describe, expect, it, vi } from "vitest";
import { consumeRateLimit } from "@/lib/shared-rate-limit";

describe("limite de tentativas partilhado", () => {
  it("usa o contador da base, com as chaves cifradas (SHA-256)", async () => {
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

  it("respeita a recusa da base", async () => {
    expect(await consumeRateLimit(["k"], { windowMs: 1000, max: 1 }, async () => false)).toBe(
      false,
    );
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
