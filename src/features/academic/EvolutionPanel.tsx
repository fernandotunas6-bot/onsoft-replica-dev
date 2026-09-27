import { useMemo, useState } from "react";
import { Panel } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { TREND_THRESHOLD, termEvolution, type AnalyticsGrade } from "./academic-analytics";

type Grade = {
  class_group_id: string | null;
  class_group_name: string;
  subject_id: string;
  subject_name: string;
  term: number;
  average: number;
};

const TREND_TONE = {
  "a subir": "text-success",
  "a descer": "text-destructive",
  estável: "text-muted-foreground",
} as const;

const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(1));

/**
 * Evolução entre períodos por turma ou por disciplina: média de cada período,
 * variação entre os dois últimos com notas e negativas no último. As que mais
 * desceram aparecem primeiro.
 */
export function EvolutionPanel({ grades, passing }: { grades: Grade[]; passing: number }) {
  const [by, setBy] = useState<"turma" | "disciplina">("turma");
  const rows = useMemo(() => {
    const mapped: AnalyticsGrade[] = grades.map((g) =>
      by === "turma"
        ? {
            groupId: g.class_group_id ?? g.class_group_name,
            groupName: g.class_group_name,
            term: g.term,
            average: g.average,
          }
        : { groupId: g.subject_id, groupName: g.subject_name, term: g.term, average: g.average },
    );
    return termEvolution(mapped, passing);
  }, [grades, by, passing]);

  return (
    <Panel
      title="Evolução entre períodos"
      description={`Onde agir primeiro: as que mais desceram. "A subir" e "a descer" a partir de ${String(TREND_THRESHOLD).replace(".", ",")} valores; negativas abaixo de ${passing}.`}
    >
      <div className="mb-3 flex gap-1" role="group" aria-label="Agrupar por">
        {(["turma", "disciplina"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={by === option}
            onClick={() => setBy(option)}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              by === option
                ? "bg-primary-soft text-primary-strong"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {option === "turma" ? "Turmas" : "Disciplinas"}
          </button>
        ))}
      </div>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">Ainda não há notas lançadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-normal">{by === "turma" ? "Turma" : "Disciplina"}</th>
                <th className="px-2 py-2 text-right font-normal">1.º</th>
                <th className="px-2 py-2 text-right font-normal">2.º</th>
                <th className="px-2 py-2 text-right font-normal">3.º</th>
                <th className="px-2 py-2 text-right font-normal">Variação</th>
                <th className="py-2 pl-2 text-right font-normal">Negativas (último)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">{r.name}</td>
                  {r.terms.map((t, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums">
                      {fmt(t.average)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.delta == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={cn(r.trend ? TREND_TONE[r.trend] : "")}>
                        {r.delta > 0 ? "+" : ""}
                        {r.delta.toFixed(1)} · {r.trend}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                    {r.latestNegativesPct == null ? "—" : `${r.latestNegativesPct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
