import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requestEmailChangeInputSchema } from "@/features/auth/email-change-server";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("mudar e-mail ou telefone exige a senha actual", () => {
  it("o pedido de e-mail sem senha é recusado", () => {
    expect(() => requestEmailChangeInputSchema.parse({ newEmail: "novo@escola.ao" })).toThrow();
    expect(
      requestEmailChangeInputSchema.parse({ newEmail: "novo@escola.ao", currentPassword: "x" })
        .currentPassword,
    ).toBe("x");
  });

  it("o servidor verifica a senha, limita pedidos e avisa o e-mail antigo", () => {
    const source = read("src/features/auth/email-change-server.ts");
    expect(source).toMatch(/passwordGrant\(currentEmail, data\.currentPassword\)/);
    expect(source).toMatch(/EMAIL_CHANGE_RATE_LIMIT/);
    expect(source).toMatch(/to: \[currentEmail\]/);
    expect(source).not.toMatch(/throw new Error\(linkError\?\.message/);
  });

  it("o telefone verifica a senha e só aceita o código pedido pela própria conta", () => {
    const phone = read("src/features/auth/phone-change-server.ts");
    expect(phone).toMatch(/passwordGrant\(currentEmail, data\.currentPassword\)/);
    expect(phone).toMatch(/userId: context\.userId,\s*\}\);/);
    const otp = read("src/features/otp/otp-service.ts");
    expect(otp).toMatch(/if \(params\.userId\) query = query\.eq\("user_id", params\.userId\)/);
  });
});
