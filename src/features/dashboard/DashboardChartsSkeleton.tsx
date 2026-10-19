/**
 * Vive fora de `DashboardCharts.tsx` de propósito. A rota `/` é o painel, mas
 * desenha o login a quem não tem sessão — e o manifesto do router pré-carrega o
 * grafo **estático** da rota. Enquanto o esqueleto saía do mesmo módulo que
 * importa `recharts`, importá-lo punha `DashboardCharts` nos recursos da rota `/`;
 * o navegador seguia o import estático desse módulo e descarregava o pedaço
 * `BarChart` (369 980 bytes) no ecrã de entrada, apesar do `lazy()`.
 * Marcação pura, sem imports: mantém o mesmo desenho sem arrastar os gráficos.
 * Guarda em `tests/ui/first-paint-budget.test.ts`.
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
