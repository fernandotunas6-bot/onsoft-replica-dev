import { describe, expect, it } from "vitest";
import {
  mustChangePassword,
  provisionalPassword,
  studentLoginEmail,
} from "@/features/students/student-accounts";
import { passwordMeetsPolicy } from "@/lib/password-policy-error";

describe("contas de aluno", () => {
  it("endereço interno: número + código da escola, sem caixa de correio de ninguém", () => {
    expect(studentLoginEmail("1260001", "SIGA-AO-000001")).toBe(
      "1260001.sigaao000001@alunos.portal-siga.com",
    );
    // O mesmo número noutra escola é outra conta.
    expect(studentLoginEmail("1260001", "SIGA-AO-000002")).not.toBe(
      studentLoginEmail("1260001", "SIGA-AO-000001"),
    );
    expect(() => studentLoginEmail("", "SIGA-AO-000001")).toThrow();
  });

  it("senha provisória legível e dentro da política, sem 0/O nem 1/I/l", () => {
    for (let i = 0; i < 200; i += 1) {
      const password = provisionalPassword();
      expect(password).toMatch(/^[A-Z]{4}-[2-9]{4}-[a-z]{2}$/);
      expect(password).not.toMatch(/[01OIl]/);
      expect(passwordMeetsPolicy(password)).toBe(true);
    }
    expect(provisionalPassword(() => 0)).toBe("AAAA-2222-aa");
  });

  it("troca obrigatória só com o sinal explícito", () => {
    expect(mustChangePassword({ must_change_password: true })).toBe(true);
    expect(mustChangePassword({ must_change_password: "true" })).toBe(false);
    expect(mustChangePassword(null)).toBe(false);
    expect(mustChangePassword({})).toBe(false);
  });
});
