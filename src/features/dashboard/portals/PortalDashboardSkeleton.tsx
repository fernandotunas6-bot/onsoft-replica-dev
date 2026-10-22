/**
 * Espera enquanto o portal do papel do utilizador carrega.
 *
 * Vive à parte e **sem um único import**, pela mesma razão que
 * `DashboardChartsSkeleton`: a rota `/` é o painel mas desenha o login a quem não
 * tem sessão, e o manifesto do router pré-carrega o grafo estático da rota. Um
 * import daqui para dentro de um portal voltaria a pôr esse portal no ecrã de
 * entrada e anularia a separação. Guarda em `tests/ui/first-paint-budget.test.ts`.
 */
export function PortalDashboardSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted/40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card h-[104px] animate-pulse bg-muted/40" />
        <div className="surface-card h-[104px] animate-pulse bg-muted/40" />
        <div className="surface-card h-[104px] animate-pulse bg-muted/40" />
        <div className="surface-card h-[104px] animate-pulse bg-muted/40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card h-[320px] animate-pulse bg-muted/40 lg:col-span-2" />
        <div className="surface-card h-[320px] animate-pulse bg-muted/40" />
      </div>
    </div>
  );
}
