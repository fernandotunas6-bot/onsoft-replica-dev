import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("propostas e decisões salariais", () => {
  const source = readFileSync("src/features/hr/salary-changes.ts", "utf8");

  it("propor e decidir exigem 2FA nesta sessão", () => {
    expect(source).toContain('requireAal2(context.claims, "Propor uma alteração salarial")');
    expect(source).toContain('requireAal2(context.claims, "Decidir uma alteração salarial")');
  });

  it("o módulo financeiro bloqueado também bloqueia salários", () => {
    expect(source).toContain(
      'await assertModuleNotBlocked(membership.schoolId, userId, "financeiro", "write")',
    );
  });
});
