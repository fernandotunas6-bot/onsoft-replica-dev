export interface FinanceOverviewSnapshot {
  totalCount: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  overdueTotal: number;
}

interface InvoiceRowLike {
  estado: "Paga" | "Pendente" | "Vencida";
  valor: number;
  recebido: number;
}

export function mapInvoicesToFinanceOverviewSnapshot(
  invoices: InvoiceRowLike[],
): FinanceOverviewSnapshot {
  const overdue = invoices.filter((invoice) => invoice.estado === "Vencida");
  return {
    totalCount: invoices.length,
    paidCount: invoices.filter((invoice) => invoice.estado === "Paga").length,
    pendingCount: invoices.filter((invoice) => invoice.estado === "Pendente").length,
    overdueCount: overdue.length,
    overdueTotal: overdue.reduce((sum, invoice) => sum + (invoice.valor - invoice.recebido), 0),
  };
}
