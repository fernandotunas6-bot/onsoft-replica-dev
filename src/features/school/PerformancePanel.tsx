import { useEffect, useState } from "react";
import { Activity, Gauge, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPerfSnapshot, type PerfSnapshot } from "@/lib/performance-supervisor";

const gradeLabel: Record<PerfSnapshot["grade"], string> = {
  good: "Rápido",
  ok: "Aceitável",
  slow: "A optimizar",
};

const gradeVariant: Record<PerfSnapshot["grade"], "default" | "secondary" | "destructive"> = {
  good: "default",
  ok: "secondary",
  slow: "destructive",
};

function formatMs(value: number | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)} ms`;
}

export function PerformancePanel() {
  const [snapshot, setSnapshot] = useState<PerfSnapshot>(() => getPerfSnapshot());

  useEffect(() => {
    const refresh = () => setSnapshot(getPerfSnapshot());
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const vitals = snapshot.vitals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Supervisão de desempenho</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mede Web Vitals, latência de consultas e toques. Objectivo: resposta ao toque abaixo de
            120&nbsp;ms (INP) e consultas abaixo de 400&nbsp;ms.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={gradeVariant[snapshot.grade]}>{gradeLabel[snapshot.grade]}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSnapshot(getPerfSnapshot())}
          >
            <RefreshCw className="size-3.5" /> Actualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "INP (toque)", value: formatMs(vitals["INP"]), hint: "≤ 120 ms ideal" },
          { label: "LCP", value: formatMs(vitals["LCP"]), hint: "≤ 1800 ms ideal" },
          { label: "FCP", value: formatMs(vitals["FCP"]), hint: "Primeiro conteúdo" },
          { label: "TTFB", value: formatMs(vitals["TTFB"]), hint: "Resposta do servidor" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="text-[11px] font-bold text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-extrabold">{item.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{item.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Consultas medidas</p>
          <p className="text-xl font-bold">{snapshot.samples}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Média</p>
          <p className="text-xl font-bold">{formatMs(snapshot.avgQueryMs)}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">P95</p>
          <p className="text-xl font-bold">{formatMs(snapshot.p95QueryMs)}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h5 className="text-xs font-bold text-muted-foreground">
            Consultas lentas (&gt; 400 ms)
          </h5>
        </div>
        {snapshot.slowQueries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Nenhuma consulta lenta registada nesta sessão. Navegue pelos módulos para calibrar.
          </p>
        ) : (
          <ul className="space-y-2">
            {snapshot.slowQueries.map((entry) => (
              <li
                key={`${entry.at}-${entry.queryKey}`}
                className="rounded-lg border border-border bg-card px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-destructive">{entry.durationMs} ms</span>
                  <span className="text-muted-foreground">
                    {new Date(entry.at).toLocaleTimeString("pt-PT")}
                  </span>
                </div>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  {entry.queryKey}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <Gauge className="size-4" /> Optimizações activas
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Pré-carregamento leve: até 4 rotas em idle (uma vez por sessão); dados só ao hover no
            menu.
          </li>
          <li>Sem MutationObserver global nem polling contínuo nos painéis.</li>
          <li>Gráficos Recharts em chunk lazy (dashboard e pauta pedagógica).</li>
          <li>
            Cache Vite: <code className="rounded bg-muted px-1">npm run siga:clean-cache</code> se o
            dev ficar pesado.
          </li>
        </ul>
        <p className="mt-2">
          Consola: <code className="rounded bg-muted px-1">window.__sigaPerf</code> e{" "}
          <code className="rounded bg-muted px-1">window.__sigaVitals</code>
        </p>
      </div>
    </div>
  );
}
