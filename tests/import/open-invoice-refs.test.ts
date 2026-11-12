import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadExistingReceiptNumbers,
  loadOpenInvoiceRefs,
} from "@/features/import/importers/finance-core";
import { fakeId, fakePostgrest } from "../helpers/fake-postgrest";

/**
 * Importação de pagamentos: as faturas em aberto da escola. Com mais de 1000, as
 * restantes não eram encontradas (o pagamento ficava «sem fatura»), e a lista de
 * contratos ia num só `.in(...)`, que passava o tamanho máximo do URL.
 */
const SCHOOL = "school";

function school(openInvoices: number) {
  const invoices = Array.from({ length: openInvoices }, (_, n) => ({
    id: fakeId("i", n),
    school_id: SCHOOL,
    contract_id: fakeId("c", n),
    invoice_number: `FT-2026/${n + 1}`,
    amount: 10000,
    discount_amount: 0,
    penalty_amount: 0,
    due_date: "2026-10-10",
    competence_month: "2026-10-01",
    status: n % 2 ? "open" : "partially_paid",
  }));
  return {
    finance_invoices: invoices,
    finance_contracts: invoices.map((i, n) => ({
      id: i.contract_id,
      school_id: SCHOOL,
      enrollment_id: fakeId("e", n),
    })),
    enrollments: invoices.map((_, n) => ({
      id: fakeId("e", n),
      school_id: SCHOOL,
      student_id: fakeId("s", n),
    })),
    finance_receipts: invoices
      .filter((i) => i.status === "partially_paid")
      .map((i, n) => ({
        id: fakeId("r", n),
        school_id: SCHOOL,
        invoice_id: i.id,
        receipt_number: `RC-${n}`,
        amount: 4000,
        status: "issued",
      })),
  };
}

const db = (tables: ReturnType<typeof school>) =>
  fakePostgrest(tables).client as unknown as SupabaseClient;

describe("loadOpenInvoiceRefs", () => {
  it("encontra todas as faturas em aberto, para lá das 1000, com o que falta pagar", async () => {
    const refs = await loadOpenInvoiceRefs(db(school(1300)), SCHOOL);
    expect(refs).toHaveLength(1300);
    const byId = new Map(refs.map((r) => [r.id, r]));
    expect(byId.get(fakeId("i", 1298))?.remaining).toBe(6000);
    expect(byId.get(fakeId("i", 1299))?.remaining).toBe(10000);
    expect(byId.get(fakeId("i", 1299))?.student_id).toBe(fakeId("s", 1299));
  });
});

describe("loadExistingReceiptNumbers", () => {
  it("lê todos os recibos: reimportar o mesmo lote é reconhecido também depois dos 1000", async () => {
    const numbers = await loadExistingReceiptNumbers(db(school(2600)), SCHOOL);
    expect(numbers.size).toBe(1300);
  });
});
