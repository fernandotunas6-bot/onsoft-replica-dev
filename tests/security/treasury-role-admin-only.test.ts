import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cargoRequiresAdministrator } from "@/features/access/server";

/**
 * Segregação de funções: a Secretaria gere contas, mas não dá acesso ao
 * dinheiro. Antes criava uma conta com cargo Tesouraria (num e-mail seu) ou
 * mudava um professor para Tesouraria.
 */
describe("Tesouraria só é atribuída por um Administrador", () => {
  it("cargo e códigos de papel de Administrador e Tesouraria exigem Administrador", () => {
    for (const value of ["Administrador", "Tesouraria", "treasury", "finance", "owner", "admin"]) {
      expect(cargoRequiresAdministrator(value), value).toBe(true);
    }
    for (const value of ["Secretaria", "Professor", "teacher", "secretary", "Aluno"]) {
      expect(cargoRequiresAdministrator(value), value).toBe(false);
    }
  });

  it("convite, convite institucional e mudança de cargo usam a mesma regra", () => {
    const code = readFileSync(join(process.cwd(), "src/features/access/server.ts"), "utf8");
    for (const fn of ["inviteSystemUser", "updateSystemAccountCargo", "createSchoolInvitation"]) {
      const start = code.indexOf(`export const ${fn} =`);
      const body = code.slice(start, code.indexOf("export const", start + 10));
      expect(body, fn).toMatch(/cargoRequiresAdministrator\(/);
    }
  });
});
