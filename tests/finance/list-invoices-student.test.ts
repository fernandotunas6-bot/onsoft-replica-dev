import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listInvoicesInputSchema } from "@/features/finance/schemas";

const studentId = "3f6b1c2e-6a1d-4c0b-9b51-0d6f3c8e2a11";

describe("listInvoices por aluno (auditoria 13, F-22)", () => {
  it("aceita o aluno e um limite maior só com aluno", () => {
    expect(listInvoicesInputSchema.parse({ studentId, limit: 1000 })).toEqual({
      studentId,
      limit: 1000,
    });
    expect(listInvoicesInputSchema.safeParse({ limit: 1000 }).success).toBe(false);
    expect(listInvoicesInputSchema.parse({ limit: 250 })).toEqual({ limit: 250 });
  });

  it("a ficha do aluno pede as faturas do aluno ao servidor", () => {
    const page = readFileSync("src/routes/alunos/$studentId.tsx", "utf8");
    expect(page).toMatch(/listInvoices\(\{ data: \{ studentId, limit: \d+ \} \}\)/);
  });

  it("o servidor filtra pelos contratos das matrículas do aluno, na escola", () => {
    const server = readFileSync("src/features/finance/server.ts", "utf8");
    const start = server.indexOf("export const listInvoices = createServerFn");
    const handler = server.slice(start, start + 3000);
    expect(handler).toContain('.eq("student_id", data.studentId)');
    expect(handler).toContain('.in("contract_id", studentContractIds)');
  });
});
