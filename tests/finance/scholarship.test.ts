import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { setScholarshipInputSchema } from "@/features/finance/scholarship-server";

/** Bolsas e descontos por aluno (2026-10-05): o desconto do contrato financeiro. */
const id = "11111111-1111-4111-8111-111111111111";

describe("bolsa ou desconto do aluno", () => {
  it("percentagem de 0 a 100, com duas casas, e motivo obrigatório", () => {
    const parse = (percent: number, reason = "Bolsa de mérito 2026") =>
      setScholarshipInputSchema.safeParse({ studentId: id, percent, reason }).success;
    expect(parse(50)).toBe(true);
    expect(parse(0)).toBe(true);
    expect(parse(12.5)).toBe(true);
    expect(parse(100)).toBe(true);
    expect(parse(-1)).toBe(false);
    expect(parse(101)).toBe(false);
    expect(parse(12.345)).toBe(false);
    expect(parse(50, " ")).toBe(false);
  });

  const source = readFileSync("src/features/finance/scholarship-server.ts", "utf8");
  const fn = (name: string) => {
    const start = source.indexOf(`export const ${name}`);
    const next = source.indexOf("export const ", start + 1);
    return source.slice(start, next === -1 ? undefined : next);
  };

  it("gravar: só Direcção e Tesouraria, com 2FA, e fica na auditoria com o antes e o depois", () => {
    const body = fn("setStudentScholarship");
    expect(body).toMatch(
      /requireSgaWriterForWrite\(\s*"financeiro",\s*context\.supabase,\s*context\.userId,\s*\["Administrador", "Tesouraria"\],?\s*\)/,
    );
    expect(body).toContain('requireAal2(context.claims, "Atribuir uma bolsa ou desconto")');
    expect(body.indexOf("requireAal2(")).toBeLessThan(body.indexOf('.from("finance_contracts")'));
    expect(body).toContain("action: SCHOLARSHIP_ACTION");
    expect(body).toContain(
      "metadata: { contract_id: contractId, before, after: data.percent, reason: data.reason }",
    );
  });

  it("toda a leitura e escrita é da escola da sessão; nunca apaga contratos", () => {
    for (const match of source.matchAll(/\.from\("([a-z_]+)"\)/g)) {
      const chain = source.slice(match.index, source.indexOf(";", match.index));
      expect(chain, match[1]).toMatch(/school_id/);
    }
    expect(source).not.toContain(".delete(");
  });
});
