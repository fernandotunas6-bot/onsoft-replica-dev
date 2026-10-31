import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/features/dashboard/student-access", () => ({
  resolveVisibleStudent: mocks.resolve,
}));

import { loadMyStudentFinance } from "@/features/finance/student-portal-ledger";

const schoolId = "11111111-1111-4111-8111-111111111111";
const otherSchool = "22222222-2222-4222-8222-222222222222";
const rows: Record<string, Array<Record<string, unknown>>> = {
  enrollments: [
    { id: "enr-1", school_id: schoolId, student_id: "student-1" },
    { id: "enr-x", school_id: otherSchool, student_id: "student-1" },
  ],
  finance_contracts: [{ id: "contract-1", school_id: schoolId, enrollment_id: "enr-1" }],
  finance_invoices: [
    {
      id: "invoice-1",
      school_id: schoolId,
      contract_id: "contract-1",
      invoice_number: "ISPAB-001",
      amount: 10000,
      discount_amount: 0,
      penalty_amount: 0,
      status: "partially_paid",
      competence_month: "2026-10-01",
      due_date: "2026-10-10",
    },
  ],
  finance_receipts: [
    {
      id: "receipt-1",
      invoice_id: "invoice-1",
      school_id: schoolId,
      receipt_number: "REC-01",
      amount: 3000,
      paid_on: "2026-10-18",
      status: "issued",
    },
    {
      id: "receipt-2",
      invoice_id: "invoice-1",
      school_id: schoolId,
      receipt_number: "REC-02",
      amount: 7000,
      paid_on: "2026-10-19",
      status: "reversed",
    },
  ],
};
function fakeDb() {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
  return {
    calls,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: (_cols: string) => chain,
        eq: (field: string, value: unknown) => {
          filters[field] = value;
          return chain;
        },
        in: (field: string, values: unknown[]) => {
          filters[field] = values;
          return chain;
        },
        order: (_field: string) => chain,
        range: (from: number, to: number) => {
          calls.push({ table, filters: { ...filters } });
          const found = (rows[table] ?? []).filter((row) =>
            Object.entries(filters).every(([k, v]) =>
              Array.isArray(v) ? v.includes(row[k]) : row[k] === v,
            ),
          );
          return Promise.resolve({ data: found.slice(from, to + 1), error: null });
        },
      };
      return chain;
    },
  };
}
beforeEach(() => vi.clearAllMocks());

describe("financeiro escolar sem registos duplicados", () => {
  it("recusa acesso sem vínculo real do aluno e a outra escola", async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(loadMyStudentFinance("user-1", schoolId)).rejects.toThrow(/Sem acesso/);
    const db = fakeDb();
    mocks.resolve.mockResolvedValue({ db, schoolId: otherSchool, studentId: "student-1" });
    await expect(loadMyStudentFinance("user-1", schoolId)).rejects.toThrow(/Sem acesso/);
    expect(db.calls).toHaveLength(0);
  });

  it("mostra recibos válidos do aluno na mesma contabilidade da tesouraria", async () => {
    const db = fakeDb();
    mocks.resolve.mockResolvedValue({ db, schoolId, studentId: "student-1" });
    const ledger = await loadMyStudentFinance("user-1", schoolId);
    expect(ledger).toMatchObject({
      billed: 10000,
      paid: 3000,
      outstanding: 7000,
      invoices: [{ number: "ISPAB-001", status: "partially_paid", outstanding: 7000 }],
      receipts: [{ number: "REC-01", amount: 3000 }],
    });
    expect(db.calls.every((c) => c.filters.school_id === schoolId)).toBe(true);
    expect(db.calls[0].filters.student_id).toBe("student-1");
    expect(ledger.receipts).toHaveLength(1);
  });
});
