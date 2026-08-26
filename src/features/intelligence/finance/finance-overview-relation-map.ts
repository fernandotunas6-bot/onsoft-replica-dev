import { kwanza } from "@/lib/currency";
import type { RelationMap } from "../types";
import type { FinanceOverviewSnapshot } from "./finance-overview-adapter";

export function buildFinanceOverviewRelationMap(): RelationMap<FinanceOverviewSnapshot> {
  return [
    {
      key: "vencidas",
      label: "Faturas vencidas",
      module: "financeiro",
      resolve: (snapshot) => ({
        status: snapshot.overdueCount === 0 ? "ok" : "critical",
        summary:
          snapshot.overdueCount === 0
            ? "Nenhuma fatura vencida"
            : `${snapshot.overdueCount} fatura(s) · ${kwanza(snapshot.overdueTotal)}`,
        route: "/faturas",
      }),
    },
    {
      key: "pendentes",
      label: "Faturas pendentes",
      module: "financeiro",
      resolve: (snapshot) => ({
        status: snapshot.pendingCount === 0 ? "empty" : "attention",
        summary:
          snapshot.pendingCount === 0
            ? "Nenhuma fatura pendente"
            : `${snapshot.pendingCount} fatura(s) a aguardar pagamento`,
        route: "/faturas",
      }),
    },
    {
      key: "pagas",
      label: "Faturas pagas",
      module: "financeiro",
      resolve: (snapshot) => ({
        status: snapshot.paidCount === 0 ? "empty" : "ok",
        summary:
          snapshot.paidCount === 0
            ? "Ainda sem faturas pagas"
            : `${snapshot.paidCount} fatura(s) regularizada(s)`,
        route: "/faturas",
      }),
    },
  ];
}
