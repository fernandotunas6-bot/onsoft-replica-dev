import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  passwordChecksOf,
  passwordMeetsPolicy,
  passwordPolicyMessage,
} from "@/lib/password-policy-error";

/**
 * A política está em dois lados: no Supabase Auth (`password_min_length` e
 * `password_required_characters`) e aqui, para a interface poder verificar antes
 * de submeter. Quando se afastam, a pessoa vê a lista toda verde e leva uma
 * recusa do servidor ao submeter — foi o que estava a acontecer até 25/10/2026,
 * porque o ecrã de reposição calculava o símbolo e esquecia-se de o exigir, e
 * nenhum ecrã pedia maiúsculas e minúsculas em separado.
 *
 * Configuração aplicada em produção a 25/10/2026:
 *   password_min_length          = 8
 *   password_required_characters = minúsculas : MAIÚSCULAS : dígitos
 *
 * Sem símbolos obrigatórios, de propósito: empurram para "Password1!" e para o
 * post-it. É também a recomendação do NIST (SP 800-63B), que prefere comprimento
 * e listas de senhas vazadas a regras de composição — e essa lista (HaveIBeenPwned)
 * exige plano Pro, que esta organização não tem.
 */

const CUMPRE = ["Senha1234", "Abcdefg1", "aB3defgh", "Correias9Azuis"];

const NAO_CUMPRE: [string, string][] = [
  ["Abcdef1", "curta (7)"],
  ["abcdefgh1", "sem maiúsculas"],
  ["ABCDEFGH1", "sem minúsculas"],
  ["Abcdefghi", "sem dígitos"],
  ["", "vazia"],
];

describe("política de senhas", () => {
  it("o mínimo é 8 e é o que a mensagem promete", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_POLICY_HINT).toContain("8");
  });

  it.each(CUMPRE)("aceita «%s»", (senha) => {
    expect(passwordMeetsPolicy(senha)).toBe(true);
  });

  it.each(NAO_CUMPRE)("recusa «%s» — %s", (senha) => {
    expect(passwordMeetsPolicy(senha)).toBe(false);
  });

  it("não exige símbolos — a decisão está documentada e é deliberada", () => {
    expect(passwordMeetsPolicy("Senha1234")).toBe(true);
    expect(passwordChecksOf("Senha1234")).not.toHaveProperty("special");
  });

  it("cada requisito é verificável em separado, para desenhar a lista", () => {
    expect(passwordChecksOf("aB3xxxxx")).toEqual({
      length: true,
      lower: true,
      upper: true,
      number: true,
    });
    expect(passwordChecksOf("abc")).toEqual({
      length: false,
      lower: true,
      upper: false,
      number: false,
    });
  });

  it("a mensagem do servidor para «characters» não promete símbolos", () => {
    const msg = passwordPolicyMessage({ code: "weak_password", reasons: ["characters"] });
    expect(msg).toBeTruthy();
    expect(msg).not.toMatch(/símbolo/i);
    expect(msg).toMatch(/maiúscul/i);
  });

  it("a mensagem de «length» cita o mesmo mínimo que o código aplica", () => {
    const msg = passwordPolicyMessage({ code: "weak_password", reasons: ["length"] });
    expect(msg).toContain(String(PASSWORD_MIN_LENGTH));
  });
});
