/**
 * Esqueleto dos gráficos do painel. Ficheiro à parte de `DashboardCharts.tsx`:
 * importá-lo de lá punha o recharts no pacote inicial do painel e anulava o
 * `lazy()` dos gráficos.
 */
export function DashboardChartsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card h-[320px] animate-pulse bg-muted/40 lg:col-span-2" />
        <div className="surface-card h-[320px] animate-pulse bg-muted/40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card h-[300px] animate-pulse bg-muted/40" />
        <div className="surface-card h-[300px] animate-pulse bg-muted/40" />
      </div>
    </div>
  );
}
