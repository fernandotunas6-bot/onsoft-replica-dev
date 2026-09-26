import { describe, expect, it } from "vitest";
import { isTwoFactorRequiredMessage } from "@/lib/two-factor-error";

describe("isTwoFactorRequiredMessage", () => {
  it("reconhece as recusas por falta de 2FA do servidor", () => {
    for (const msg of [
      "Esta conta precisa de 2FA activo para matricular alunos.",
      "Aluno criado, mas esta conta precisa de 2FA activo para o colocar na turma.",
      "Esta conta precisa de verificação em duas etapas (2FA) activa para criar alunos.",
    ]) {
      expect(isTwoFactorRequiredMessage(msg)).toBe(true);
    }
  });

  it("não confunde outros erros", () => {
    expect(isTwoFactorRequiredMessage("Turma sem vagas.")).toBe(false);
    expect(isTwoFactorRequiredMessage("Não foi possível aceitar.")).toBe(false);
  });
});
