import { describe, expect, it } from "vitest";
import { resetPasswordWithOtpInputSchema } from "@/features/auth/reset-password-otp-server";

describe("Reset Password with OTP Schema", () => {
  it("valida parâmetros corretos para redefinição com OTP", () => {
    const valid = resetPasswordWithOtpInputSchema.parse({
      targetIdentifier: "+244923111222",
      code: "483921",
      newPassword: "MinhaSenhaForte2026!",
    });
    expect(valid.targetIdentifier).toBe("+244923111222");
    expect(valid.code).toBe("483921");
    expect(valid.newPassword).toBe("MinhaSenhaForte2026!");
  });

  it("rejeita código que não tenha 6 dígitos", () => {
    expect(() =>
      resetPasswordWithOtpInputSchema.parse({
        targetIdentifier: "utilizador@escola.ao",
        code: "123",
        newPassword: "MinhaSenhaForte2026!",
      }),
    ).toThrow();
  });

  it("rejeita senha menor que 8 caracteres", () => {
    expect(() =>
      resetPasswordWithOtpInputSchema.parse({
        targetIdentifier: "utilizador@escola.ao",
        code: "123456",
        newPassword: "curta",
      }),
    ).toThrow();
  });
});
