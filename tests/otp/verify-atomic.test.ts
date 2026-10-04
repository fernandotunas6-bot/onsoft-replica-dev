import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("verificação de OTP", () => {
  const source = readFileSync("src/features/otp/otp-service.ts", "utf8");
  const verify = source.slice(source.indexOf("public static async verifyCode"));

  it("gasta a tentativa com update condicional antes de comparar o código", () => {
    const claim = verify.indexOf('.eq("attempts_left", record.attempts_left)');
    const compare = verify.indexOf("this.hashCode(params.code");
    expect(claim).toBeGreaterThan(-1);
    expect(compare).toBeGreaterThan(claim);
    expect(verify).toContain("if (!claimed?.length)");
  });

  it("um código certo só é aceite uma vez", () => {
    expect(verify).toContain("if (consumed?.length) return { valid: true };");
  });
});
