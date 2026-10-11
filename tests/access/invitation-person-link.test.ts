import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * As regras da ligação (e-mail exacto, curingas do ILIKE escapados, uma única
 * ficha sem conta, nunca trocar a conta de uma ficha) vivem em
 * `person-link.ts` e são testadas em `person-link.test.ts`. Aqui garante-se que
 * os dois caminhos que criam contas as usam, sem uma cópia própria.
 */
describe("ligação da conta à ficha da pessoa", () => {
  const source = readFileSync("src/features/access/server.ts", "utf8");
  const body = (name: string) => {
    const start = source.indexOf(`export const ${name}`);
    return source.slice(start, source.indexOf("export const", start + 1));
  };

  it("aceitar um convite e criar a conta em Acessos usam a mesma regra", () => {
    expect(body("acceptSchoolInvitation")).toContain(
      "linkPersonByEmail(admin, schoolId, invitedEmail, userId)",
    );
    expect(body("inviteSystemUser")).toContain(
      "linkPersonByEmail(admin, schoolId, data.email, userId)",
    );
  });

  it("nenhum deles liga a ficha por conta própria", () => {
    for (const name of ["acceptSchoolInvitation", "inviteSystemUser"]) {
      expect(body(name), name).not.toMatch(/\.update\(\{ user_id: userId \}\)/);
    }
  });

  it("quem cria a conta é avisado quando a ficha não fica ligada", () => {
    expect(body("inviteSystemUser")).toContain("personLinkWarning: personLinkMessage");
  });
});
