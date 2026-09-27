import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import type { YearComparison } from "./academic-analytics";
import { getYearComparison } from "./year-comparison";

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

/**
 * Comparativo entre anos lectivos a partir do histórico académico oficial:
 * alunos registados, média final e taxa de transição por ano, e a taxa de
 * transição por classe ao longo dos anos. Só números agregados.
 */
export function YearComparisonPanel({ enabled }: { enabled: boolean }) {
  const [view, setView] = useState<"anos" | "classes">("anos");
  const query = useQuery({
    queryKey: ["academic", "year-comparison"],
    queryFn: () => getYearComparison() as Promise<YearComparison>,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const data = query.data;
  // Os últimos cinco anos chegam para ver a tendência sem alargar a tabela.
  const years = (data?.years ?? []).slice(-5);
  const labels = years.map((y) => y.yearLabel);

  return (
    <Panel
      title="Comparativo entre anos lectivos"
      description="Do histórico académico oficial (resultados registados no fim de cada ano). Transição sobre os alunos com situação decidida."
    >
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar o histórico…</p>
      ) : query.isError ? (
        <p className="text-sm text-muted-foreground">
          {query.error instanceof Error ? query.error.message : "Não foi possível carregar."}
        </p>
      ) : !years.length ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há resultados registados no histórico. Registam-se em Pedagógica → Exames, no
          fim do ano.
        </p>
      ) : (
        <>
          <div className="mb-3 flex gap-1" role="group" aria-label="Ver por">
            {(["anos", "classes"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  view === option
                    ? "bg-primary-soft text-primary-strong"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {option === "anos" ? "Por ano" : "Por classe"}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            {view === "anos" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">Ano lectivo</th>
                    <th className="px-2 py-2 text-right font-normal">Alunos</th>
                    <th className="px-2 py-2 text-right font-normal">Média final</th>
                    <th className="px-2 py-2 text-right font-normal">Transitaram</th>
                    <th className="py-2 pl-2 text-right font-normal">Face ao anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((y) => (
                    <tr key={y.yearLabel} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">{y.yearLabel}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{y.students}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {y.average == null ? "—" : y.average.toFixed(1)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{pct(y.passPct)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">
                        {y.passDelta == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={cn(
                              y.passDelta > 0
                                ? "text-success"
                                : y.passDelta < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                            )}
                          >
                            {y.passDelta > 0 ? "+" : ""}
                            {y.passDelta} pontos
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">Classe</th>
                    {labels.map((label) => (
                      <th key={label} className="px-2 py-2 text-right font-normal">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.levels ?? []).map((level) => (
                    <tr key={level.gradeLevel} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">{level.gradeLevel}</td>
                      {labels.map((label) => (
                        <td key={label} className="px-2 py-2 text-right tabular-nums">
                          {pct(level.byYear[label] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
