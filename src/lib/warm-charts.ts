import { onIdle } from "@/lib/preload";

/** Pré-carrega o chunk Recharts do dashboard em tempo livre. */
export function warmDashboardCharts() {
  onIdle(() => {
    void import("@/features/dashboard/DashboardCharts");
  });
}

export function warmPedagogicaCharts() {
  onIdle(() => {
    void import("@/features/academic/PedagogicaNotasCharts");
  });
}

export function warmFinanceCharts() {
  onIdle(() => {
    void import("@/features/finance/FinanceiroCashChart");
    void import("@/features/finance/RelatoriosFinanceirosCategoryCharts");
  });
}

export function warmReportCharts() {
  onIdle(() => {
    void import("@/features/academic/RelatoriosAcademicosCharts");
  });
}
