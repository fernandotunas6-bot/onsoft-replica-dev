import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest } from "../helpers/fake-postgrest";

/**
 * Sincronização SIGA → PayFlow: uma fatura paga em parte na tesouraria ia pelo total, e o
 * encarregado pagava outra vez a parte já paga. Vai agora pelo que falta; liquidada, como paga.
 */
const S = "school-1";
const tables = {
  students: [
    { id: "st-1", school_id: S, student_number: "2026001", status: "active", person_id: "p-1" },
  ],
  schools: [{ id: S, tenant_id: "t-1", name: "Escola Teste" }],
  people: [{ id: "p-1", school_id: S, full_name: "Ana Aluno", email: null, phone: null }],
  enrollments: [
    {
      id: "en-1",
      school_id: S,
      student_id: "st-1",
      class_group_id: "cg-1",
      academic_year_id: "ay-1",
      status: "active",
    },
  ],
  class_groups: [{ id: "cg-1", school_id: S, name: "10.ª A" }],
  student_guardians: [],
  finance_contracts: [{ id: "c-1", school_id: S, enrollment_id: "en-1" }],
  finance_invoices: [
    // 50 000 com 30 000 pagos: faltam 20 000.
    {
      id: "inv-1",
      school_id: S,
      contract_id: "c-1",
      invoice_number: "FT 1",
      amount: 50000,
      discount_amount: 0,
      penalty_amount: 0,
      due_date: "2099-01-01",
      status: "partially_paid",
      fee_item_id: null,
      competence_month: null,
    },
    // Paga por recibos mas ainda marcada em aberto: vai como paga.
    {
      id: "inv-2",
      school_id: S,
      contract_id: "c-1",
      invoice_number: "FT 2",
      amount: 10000,
      discount_amount: 0,
      penalty_amount: 0,
      due_date: "2099-01-01",
      status: "open",
      fee_item_id: null,
      competence_month: null,
    },
    // Sem recibos: vai pelo total.
    {
      id: "inv-3",
      school_id: S,
      contract_id: "c-1",
      invoice_number: "FT 3",
      amount: 8000,
      discount_amount: 0,
      penalty_amount: 0,
      due_date: "2099-01-01",
      status: "open",
      fee_item_id: null,
      competence_month: null,
    },
  ],
  finance_receipts: [
    { id: "r-1", school_id: S, invoice_id: "inv-1", amount: 30000, status: "issued" },
    { id: "r-2", school_id: S, invoice_id: "inv-1", amount: 5000, status: "reversed" },
    { id: "r-3", school_id: S, invoice_id: "inv-2", amount: 10000, status: "issued" },
  ],
  fee_items: [],
};

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => fakePostgrest(tables).client,
}));
vi.mock("@/lib/ecosystem-urls", () => ({
  getPayflowUrl: (path: string) => `https://payflow.test${path}`,
}));
vi.mock("@/features/school/server", () => ({
  loadSchoolSettingsBundle: async () => ({
    banking: { account_holder: "", bank_name: "", iban: "" },
    currency: "AOA",
  }),
}));

describe("executePayflowStudentSync", () => {
  let sent: { invoices: Array<{ id: string; amount: number; status: string }> } | null = null;

  beforeEach(() => {
    process.env.PAYFLOW_INTEGRATION_API_KEY = "k".repeat(32);
    sent = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ data: { student_code: "X", synced_at: "now" } }), {
        status: 200,
      });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("envia o que falta pagar, e as liquidadas como pagas", async () => {
    const { executePayflowStudentSync } = await import("@/features/finance/payflow-sync-execute");
    await executePayflowStudentSync({ schoolId: S, studentId: "st-1" });
    const byId = new Map(sent!.invoices.map((invoice) => [invoice.id, invoice]));
    expect(byId.get("inv-1")).toMatchObject({ amount: 2_000_000, status: "open" });
    expect(byId.get("inv-2")).toMatchObject({ amount: 1_000_000, status: "paid" });
    expect(byId.get("inv-3")).toMatchObject({ amount: 800_000, status: "open" });
  });
});
