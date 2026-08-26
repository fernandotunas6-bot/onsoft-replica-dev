import { describe, expect, it } from "vitest";
import { mapInvoicesToFinanceOverviewSnapshot } from "@/features/intelligence/finance/finance-overview-adapter";

describe("mapInvoicesToFinanceOverviewSnapshot", () => {
  it("counts invoices by status and sums the overdue balance", () => {
    const snapshot = mapInvoicesToFinanceOverviewSnapshot([
      { estado: "Paga", valor: 15000, recebido: 15000 },
      { estado: "Pendente", valor: 18000, recebido: 0 },
      { estado: "Vencida", valor: 20000, recebido: 5000 },
      { estado: "Vencida", valor: 10000, recebido: 0 },
    ]);
    expect(snapshot).toEqual({
      totalCount: 4,
      paidCount: 1,
      pendingCount: 1,
      overdueCount: 2,
      overdueTotal: 25000,
    });
  });

  it("handles an empty invoice list", () => {
    const snapshot = mapInvoicesToFinanceOverviewSnapshot([]);
    expect(snapshot).toEqual({
      totalCount: 0,
      paidCount: 0,
      pendingCount: 0,
      overdueCount: 0,
      overdueTotal: 0,
    });
  });
});
