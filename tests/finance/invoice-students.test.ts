import { describe, expect, it } from "vitest";
import { studentNumbersForInvoices } from "@/features/finance/invoice-students";

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>, failing: string[] = []) {
  const calls: Array<{ table: string; size: number }> = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let size = 0;
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        size = values.length;
        rows = rows.filter((r) => values.includes(r[column]));
        return builder;
      },
      then: (resolve: (v: unknown) => unknown) => {
        calls.push({ table, size });
        return resolve(
          failing.includes(table)
            ? { data: null, error: { message: "falhou" } }
            : { data: rows, error: null },
        );
      },
    };
    return builder;
  };
  return { db: { from } as never, calls };
}

const S = "school-a";
const tables = {
  finance_invoices: [
    { id: "i1", school_id: S, contract_id: "c1" },
    { id: "i2", school_id: S, contract_id: null },
    { id: "i3", school_id: "school-b", contract_id: "c1" },
  ],
  finance_contracts: [{ id: "c1", school_id: S, enrollment_id: "e1" }],
  enrollments: [{ id: "e1", school_id: S, student_id: "s1" }],
  students: [{ id: "s1", school_id: S, student_number: "1260042" }],
};

describe("nº de aluno de cada factura", () => {
  it("segue factura → contrato → matrícula → aluno, só na escola", async () => {
    const { db } = fakeDb(tables);
    const numbers = await studentNumbersForInvoices(db, S, ["i1", "i2", "i3", "i1"]);
    expect([...numbers]).toEqual([["i1", "1260042"]]);
  });

  it("lê em lotes de 150", async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `x${i}`);
    const { db, calls } = fakeDb(tables);
    await studentNumbersForInvoices(db, S, ids);
    expect(calls.filter((c) => c.table === "finance_invoices").map((c) => c.size)).toEqual([
      150, 150, 20,
    ]);
  });

  it("uma leitura que falha deixa a lista sem número, sem erro", async () => {
    const { db } = fakeDb(tables, ["students"]);
    expect((await studentNumbersForInvoices(db, S, ["i1"])).size).toBe(0);
  });
});
