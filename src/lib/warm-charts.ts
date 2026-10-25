import { canPrefetchResources, onIdle } from "@/lib/preload";

function canWarm() {
  return (
    typeof window !== "undefined" && document.visibilityState !== "hidden" && canPrefetchResources()
  );
}

/** Uma intenção por grupo; falhas especulativas permitem tentar novamente. */
function idleWarm(load: () => Promise<unknown>) {
  let pending = false;
  let loaded = false;
  return () => {
    if (pending || loaded || !canWarm()) return;
    pending = true;
    onIdle(() => {
      if (!canWarm()) {
        pending = false;
        return;
      }
      void load()
        .then(() => {
          loaded = true;
        })
        // É só antecipação: o lazy normal continua a tratar erros quando usado.
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    });
  };
}

/** Pré-carrega o chunk Recharts do dashboard em tempo livre. */
export const warmDashboardCharts = idleWarm(() => import("@/features/dashboard/DashboardCharts"));

export const warmPedagogicaCharts = idleWarm(
  () => import("@/features/academic/PedagogicaNotasCharts"),
);

export const warmFinanceCharts = idleWarm(() =>
  Promise.all([
    import("@/features/finance/FinanceiroCashChart"),
    import("@/features/finance/RelatoriosFinanceirosCategoryCharts"),
  ]),
);

export const warmReportCharts = idleWarm(
  () => import("@/features/academic/RelatoriosAcademicosCharts"),
);
