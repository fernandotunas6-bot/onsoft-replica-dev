import { kwanza } from "@/lib/currency";
import type { SuggestionRule } from "../types";
import type { FinanceOverviewSnapshot } from "./finance-overview-adapter";

export function buildFinanceOverviewSuggestionRules(): SuggestionRule<FinanceOverviewSnapshot>[] {
  return [
    {
      id: "faturas-vencidas",
      evaluate: (snapshot) =>
        snapshot.overdueCount > 0
          ? {
              id: "faturas-vencidas",
              priority: 95,
              category: "financeiro",
              module: "financeiro",
              title: "Cobrar faturas vencidas",
              description: `${snapshot.overdueCount} fatura(s) vencida(s), totalizando ${kwanza(snapshot.overdueTotal)}.`,
              route: "/faturas",
              reason: "Existem faturas em atraso por regularizar.",
            }
          : null,
    },
    {
      id: "muitas-pendentes",
      evaluate: (snapshot) =>
        snapshot.pendingCount >= 10
          ? {
              id: "muitas-pendentes",
              priority: 60,
              category: "financeiro",
              module: "financeiro",
              title: "Acompanhar faturas pendentes",
              description: `${snapshot.pendingCount} fatura(s) por aguardar pagamento.`,
              route: "/faturas",
              reason: "Volume elevado de faturas ainda não liquidadas.",
            }
          : null,
    },
    {
      id: "emitir-relatorio",
      evaluate: () => ({
        id: "emitir-relatorio",
        priority: 10,
        category: "geral",
        module: "financeiro",
        title: "Ver relatórios financeiros",
        route: "/relatorios/financeiros",
        reason: "Ação frequente para acompanhar a situação financeira da escola.",
      }),
    },
  ];
}
