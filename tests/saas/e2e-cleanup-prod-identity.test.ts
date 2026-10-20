import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertProductionE2ECleanupIdentity } from "../../scripts/siga/e2e-cleanup-prod-identity.mjs";

describe("limpeza E2E em produção: confirmação do contacto", () => {
  it("aceita apenas o contacto de testes exacto e normalizado", () => {
    expect(() =>
      assertProductionE2ECleanupIdentity(
        "  E2E+abc@SIGA-PLUS.TEST ",
        "e2e+abc@siga-plus.test",
      ),
    ).not.toThrow();
  });

  it("recusa e-mail omitido ou sem correspondência com o tenant", () => {
    for (const [adminEmail, tenantEmail] of [
      [undefined, "e2e@ siga-plus.test"],
      ["e2e@siga-plus.test", undefined],
      ["e2e-a@siga-plus.test", "e2e-b@siga-plus.test"],
      ["admin@escola.ao", "admin@escola.ao"],
      ["e2e@siga-plus.test.evil.test", "e2e@siga-plus.test.evil.test"],
    ] as const) {
      expect(() => assertProductionE2ECleanupIdentity(adminEmail, tenantEmail)).toThrow(
        /bloqueada/,
      );
    }
  });

  it("a purga que desliga triggers não pode ser importada directamente", () => {
    const file = readFileSync(
      resolve(process.cwd(), "scripts/siga/e2e-cleanup-lib.mjs"),
      "utf8",
    );
    expect(file).toContain("async function purgeSchoolDependencies(schoolId)");
    expect(file).not.toContain("export async function purgeSchoolDependencies");
    expect(file).toContain("assertProductionE2ECleanupIdentity(adminEmail, tenant.contact_email)");
  });
});
