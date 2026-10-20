import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertProductionE2ECleanupIdentity,
  assertProductionArtifactCount,
  assertCleanupAccountOwnedBySchool,
  parseE2ECleanupArgs,
} from "../../scripts/siga/e2e-cleanup-prod-identity.mjs";

describe("limpeza E2E em produção: confirmação do contacto", () => {
  it("aceita apenas o contacto de testes exacto e normalizado", () => {
    expect(() =>
      assertProductionE2ECleanupIdentity("  E2E+abc@SIGA-PLUS.TEST ", "e2e+abc@siga-plus.test"),
    ).not.toThrow();
  });

  it("recusa e-mail omitido ou sem correspondência com o tenant", () => {
    for (const [adminEmail, tenantEmail] of [
      [undefined, "e2e@siga-plus.test"],
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
    const file = readFileSync(resolve(process.cwd(), "scripts/siga/e2e-cleanup-lib.mjs"), "utf8");
    expect(file).toContain("async function purgeSchoolDependencies(schoolId)");
    expect(file).not.toContain("export async function purgeSchoolDependencies");
    expect(file).toContain("assertProductionE2ECleanupIdentity(adminEmail, tenant.contact_email)");
  });
});

describe("CLI E2E seguro — simulação por defeito", () => {
  const id = "11111111-2222-4333-8444-555555555555";

  it("não elimina nada sem --execute", () => {
    expect(parseE2ECleanupArgs([])).toEqual({ execute: false, tenantId: null });
    expect(parseE2ECleanupArgs(["--dry-run"])).toEqual({ execute: false, tenantId: null });
    expect(parseE2ECleanupArgs(["--tenant-id", id])).toEqual({
      execute: false,
      tenantId: id,
    });
  });

  it("autoriza explicitamente apenas um UUID", () => {
    expect(parseE2ECleanupArgs(["--execute", "--tenant-id", id])).toEqual({
      execute: true,
      tenantId: id,
    });
    expect(parseE2ECleanupArgs(["--execute", `--tenant-id=${id}`])).toEqual({
      execute: true,
      tenantId: id,
    });
  });

  it("bloqueia execução em lote, ambiguidades e parâmetros desconhecidos", () => {
    for (const args of [
      ["--execute"],
      ["--execute", "--dry-run", "--tenant-id", id],
      ["--execute", "--tenant-id", "qualquer"],
      ["--tenant-id", id, "--tenant-id", id],
      ["--delete-all"],
      ["--tenant-id", "1234"],
    ]) {
      expect(() => parseE2ECleanupArgs(args)).toThrow(/bloqueada/);
    }
  });

  it("o CLI não pode voltar a apagar por defeito", () => {
    const file = readFileSync(resolve(process.cwd(), "scripts/siga/e2e-cleanup-stale.mjs"), "utf8");
    expect(file).toContain("const dryRun = !mode.execute");
    expect(file).toContain("mode.execute && stale.length !== 1");
  });
});

describe("retenção segura de dados institucionais na produção", () => {
  it("recusa qualquer quantidade positiva, negativa ou não verificada", () => {
    for (const table of ["students", "enrollments", "finance_invoices", "saas_audit_logs"]) {
      for (const count of [1, 34, 43, -1, null, undefined, Number.NaN]) {
        expect(() => assertProductionArtifactCount(table, count)).toThrow(/bloqueada/);
      }
      expect(() => assertProductionArtifactCount(table, 0)).not.toThrow();
    }
  });

  it("a função E2E impede apagar dados académicos, financeiros e auditoria", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/siga/e2e-cleanup-lib.mjs"), "utf8");
    expect(source).toContain("if (target.production) {");
    expect(source).toContain("await assertNoProductionSchoolArtifacts");
    for (const table of ["students", "enrollments", "finance_invoices", "saas_audit_logs"]) {
      expect(source).toContain(`"${table}"`);
    }
    expect(source).toContain("tenant.id !== approvedTenantId");
  });
});

describe("não apagar autenticação partilhada entre escolas", () => {
  const schoolId = "11111111-2222-4333-8444-555555555555";
  const otherSchoolId = "99999999-2222-4333-8444-555555555555";

  it("aceita apenas vínculos da escola que será removida", () => {
    expect(() => assertCleanupAccountOwnedBySchool([schoolId], schoolId)).not.toThrow();
    expect(() => assertCleanupAccountOwnedBySchool([schoolId, schoolId], schoolId)).not.toThrow();
  });

  it("recusa conta com qualquer vínculo noutra escola, mesmo antigo", () => {
    for (const memberships of [[otherSchoolId], [schoolId, otherSchoolId]]) {
      expect(() => assertCleanupAccountOwnedBySchool(memberships, schoolId)).toThrow(
        /outras escolas/,
      );
    }
  });

  it("recusa conta sem vínculo confirmado ou sem escola identificada", () => {
    expect(() => assertCleanupAccountOwnedBySchool([], schoolId)).toThrow(/vínculo incerto/);
    expect(() => assertCleanupAccountOwnedBySchool([schoolId], null)).toThrow(/bloqueada/);
  });

  it("valida a conta antes de eliminar escolas e tenants", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/siga/e2e-cleanup-lib.mjs"), "utf8");
    expect(source).toContain("assertCleanupAccountOwnedBySchool(");
    expect(source.indexOf("assertCleanupAccountOwnedBySchool(")).toBeLessThan(
      source.indexOf("await purgeSchoolDependencies("),
    );
    expect(source).toContain("await findAuthUserForCleanup(admin, email)");
    expect(source).toContain("page <= 50");
    expect(source).toContain('count: "exact", head: true');
    expect(source).toContain("Limpeza incompleta: conta Auth preservada");
    expect(source.indexOf("assertCleanupAccountOwnedBySchool(")).toBeLessThan(
      source.indexOf("await admin.from(\"tenants\").delete()"),
    );
  });
});
