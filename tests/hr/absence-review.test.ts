import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("revisão de faltas de funcionários", () => {
  const source = readFileSync("src/features/hr/absences.ts", "utf8");
  const review = source.slice(source.indexOf("export const reviewHrAbsence"));

  it("exige 2FA, porque a falta entra no desconto do salário", () => {
    expect(review).toContain("requireAal2(context.claims,");
  });

  it("uma segunda decisão em simultâneo é recusada, não dada como guardada", () => {
    expect(review).toContain('.eq("validation_status", "pending")\n      .select("id")');
    expect(review).toContain("if (!reviewed?.length) throw new Error(");
  });
});
