import { describe, expect, it } from "vitest";
import {
  mustChangePassword,
  pickPortalHost,
  provisionalPassword,
  slipSignIn,
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

  it("a ficha manda entrar com o que funciona para esta conta", () => {
    const base = {
      studentNumber: "1260001",
      loginEmail: "1260001.sigaao000001@alunos.portal-siga.com",
    };
    expect(slipSignIn({ ...base, numberLoginEnabled: true, hasBi: false })).toEqual({
      value: "1260001",
      code: true,
    });
    expect(slipSignIn({ ...base, numberLoginEnabled: true, hasBi: true }).value).toContain("B.I.");
    // Sem a opção da escola, o número não entra: o BI, ou o endereço interno.
    expect(slipSignIn({ ...base, numberLoginEnabled: false, hasBi: true })).toEqual({
      value: "o número do teu B.I.",
      code: false,
    });
    expect(slipSignIn({ ...base, numberLoginEnabled: false, hasBi: false })).toEqual({
      value: base.loginEmail,
      code: true,
    });
  });

  it("endereço da ficha: domínio próprio, senão o subdomínio, nunca o portal geral", () => {
    const sub = { hostname: "ispab.portal-siga.com", type: "siga_subdomain" };
    const own = { hostname: "portal.ispab.ao", type: "custom" };
    expect(pickPortalHost([sub, own], "ispab.portal-siga.com")).toBe("portal.ispab.ao");
    expect(pickPortalHost([sub], null)).toBe("ispab.portal-siga.com");
    expect(pickPortalHost([], "ispab.portal-siga.com")).toBe("ispab.portal-siga.com");
    expect(pickPortalHost([], null)).toBeNull();
  });
});
