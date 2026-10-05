import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/school/server.ts", "utf8");
const handler = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("dados bancários e regras de cobrança da escola", () => {
  it("mudar o IBAN exige 2FA e fica na auditoria, mascarado", () => {
    const banking = handler("updateSchoolBanking");
    expect(banking).toContain("requireAal2(context.claims,");
    expect(banking).toContain('action: "school.banking.changed"');
    expect(banking).toContain("iban: maskIban(iban)");
    expect(banking).not.toMatch(/iban:\s*iban\b/);
  });

  it("mudar as regras de cobrança exige 2FA", () => {
    expect(handler("updateBillingSettings")).toContain("requireAal2(context.claims,");
  });
});
