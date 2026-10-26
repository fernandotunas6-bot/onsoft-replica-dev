import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/documents/verification.ts", "utf8");
const register = source.slice(source.indexOf("export const registerIssuedDocument"));

describe("registo de documentos emitidos", () => {
  it("escola bloqueada não emite documentos oficiais (auditoria 13, A1)", () => {
    expect(register.indexOf("assertTenantAllowsWrites(membership.schoolId)")).toBeGreaterThan(-1);
    expect(register.indexOf("assertTenantAllowsWrites(membership.schoolId)")).toBeLessThan(
      register.indexOf(".insert("),
    );
  });
});
