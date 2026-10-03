import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vocabulário real de `finance_invoices_status_check` em produção, lido do DDL capturado
 * (20260924005132_capture_undeclared_production_tables.sql). O teste falha se o código
 * voltar a escrever um estado fora desta lista — foi assim que `"issued"` passou.
 */
const ESTADOS_VALIDOS_FATURA = ["open", "partially_paid", "paid", "cancelled"];

/** Colunas reais de `finance_invoices`. Não tem `updated_at` — escrever nela dá 42703. */
const COLUNAS_FATURA = new Set([
  "id",
  "school_id",
  "contract_id",
  "fee_item_id",
  "invoice_number",
  "competence_month",
  "amount",
  "discount_amount",
  "due_date",
  "status",
  "issued_by",
  "cancelled_at",
  "cancelled_by",
  "cancellation_reason",
  "created_at",
  "penalty_amount",
]);

type Escrita = {
  tabela: string;
  patch: Record<string, unknown>;
  filtros: Array<[string, string, unknown]>;
};

const escritas: Escrita[] = [];
const estado = {
  fatura: { id: "inv-1", school_id: "school-1", status: "paid" } as Record<string, unknown> | null,
  recibos: [] as Array<{ id: string; status: string; external_id?: string | null }>,
};

function construirConsulta(tabela: string, dados: unknown) {
  const filtros: Array<[string, string, unknown]> = [];
  const consulta: Record<string, unknown> = {
    select: () => consulta,
    eq: (coluna: string, valor: unknown) => {
      filtros.push(["eq", coluna, valor]);
      return consulta;
    },
    neq: (coluna: string, valor: unknown) => {
      filtros.push(["neq", coluna, valor]);
      return consulta;
    },
    maybeSingle: () => Promise.resolve({ data: dados, error: null }),
    then: (resolver: (v: unknown) => unknown) => resolver({ data: dados, error: null }),
  };
  return { consulta, filtros };
}

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({
    from: (tabela: string) => ({
      select: () => {
        const dados = tabela === "finance_invoices" ? estado.fatura : estado.recibos;
        return construirConsulta(tabela, dados).consulta;
      },
      update: (patch: Record<string, unknown>) => {
        const { consulta, filtros } = construirConsulta(tabela, null);
        escritas.push({ tabela, patch, filtros });
        return consulta;
      },
    }),
  }),
}));

const { applyPayflowSettlement } = await import("@/features/finance/payflow-settlement");

function estornar() {
  return applyPayflowSettlement({
    event: "payment.refunded",
    school_id: "school-1",
    invoice_id: "inv-1",
    payment_id: "pay-000123",
    amount_minor: 4_500_000,
    currency: "AOA",
  });
}

describe("estorno PayFlow", () => {
  beforeEach(() => {
    escritas.length = 0;
    estado.fatura = { id: "inv-1", school_id: "school-1", status: "paid" };
    estado.recibos = [{ id: "rec-1", status: "issued", external_id: "pay-000123" }];
  });

  it("reabre a fatura com um estado que o CHECK da base admite", async () => {
    const resultado = await estornar();

    expect(resultado.ok).toBe(true);
    const escritaFatura = escritas.find((e) => e.tabela === "finance_invoices");
    expect(escritaFatura, "o estorno tem de reabrir a fatura").toBeDefined();
    expect(ESTADOS_VALIDOS_FATURA).toContain(escritaFatura!.patch["status"]);
    expect(escritaFatura!.patch["status"]).toBe("open");
  });

  it("não escreve colunas que a tabela não tem", async () => {
    await estornar();

    const escritaFatura = escritas.find((e) => e.tabela === "finance_invoices");
    for (const coluna of Object.keys(escritaFatura!.patch)) {
      expect(COLUNAS_FATURA, `finance_invoices não tem coluna "${coluna}"`).toContain(coluna);
    }
  });

  it("só estorna recibos que ainda estão emitidos", async () => {
    await estornar();

    const escritaRecibo = escritas.find((e) => e.tabela === "finance_receipts");
    expect(escritaRecibo!.patch["status"]).toBe("reversed");
    expect(escritaRecibo!.filtros).toContainEqual(["eq", "status", "issued"]);
  });

  it("repõe uma fatura que o bug anterior deixou presa em paid sem recibos activos", async () => {
    estado.recibos = [{ id: "rec-1", status: "reversed", external_id: "pay-000123" }];

    const resultado = await estornar();

    expect(resultado.ok).toBe(true);
    const escritaFatura = escritas.find((e) => e.tabela === "finance_invoices");
    expect(escritaFatura, "o estado preso tem de ser reposto").toBeDefined();
    expect(escritaFatura!.patch["status"]).toBe("open");
  });

  it("é idempotente depois de o estorno já estar reflectido", async () => {
    estado.fatura = { id: "inv-1", school_id: "school-1", status: "open" };
    estado.recibos = [{ id: "rec-1", status: "reversed", external_id: "pay-000123" }];

    const resultado = await estornar();

    expect(resultado).toMatchObject({ ok: true, idempotent: true });
    expect(escritas, "nada a escrever num estorno já reflectido").toHaveLength(0);
  });

  it("não reabre uma fatura cancelada", async () => {
    estado.fatura = { id: "inv-1", school_id: "school-1", status: "cancelled" };
    estado.recibos = [{ id: "rec-1", status: "issued", external_id: "pay-000123" }];

    await estornar();

    expect(escritas.find((e) => e.tabela === "finance_invoices")).toBeUndefined();
  });

  it("não anula recibos pagos por outro canal (caixa) da mesma fatura", async () => {
    estado.recibos = [
      { id: "rec-caixa", status: "issued", external_id: null },
      { id: "rec-payflow", status: "issued", external_id: "pay-000123" },
    ];

    await estornar();

    const anulados = escritas.filter((e) => e.tabela === "finance_receipts");
    expect(anulados).toHaveLength(1);
    expect(anulados[0]!.filtros).toContainEqual(["eq", "id", "rec-payflow"]);
  });

  it("sem recibo do pagamento PayFlow, recusa em vez de anular os outros", async () => {
    estado.recibos = [{ id: "rec-caixa", status: "issued", external_id: null }];

    const resultado = await estornar();

    expect(resultado).toMatchObject({ ok: false, status: 409 });
    expect(escritas, "nenhum recibo nem fatura alterados").toHaveLength(0);
  });
});
