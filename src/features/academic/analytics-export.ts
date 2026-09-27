/**
 * Colunas de exportação (CSV e PDF) dos painéis de análise dos relatórios
 * académicos. Médias e variações saem como números (o Excel soma-as e não as
 * confunde com fórmulas, como faria com o texto "+1.0"); percentagens como
 * "83%"; "—" onde não há dado.
 */
import type { EvolutionRow, YearComparison, YearSummary } from "./academic-analytics";

export type ExportColumn<Row> = { label: string; value: (row: Row) => string | number };

const dash = "—";
const num = (v: number | null) => (v == null ? dash : v);
const pct = (v: number | null) => (v == null ? dash : `${v}%`);

export function evolutionColumns(by: "turma" | "disciplina", termCount = 3) {
  const columns: ExportColumn<EvolutionRow>[] = [
    { label: by === "turma" ? "Turma" : "Disciplina", value: (r) => r.name },
    ...Array.from({ length: termCount }, (_, i) => ({
      label: `${i + 1}.º período`,
      value: (r: EvolutionRow) => num(r.terms[i]?.average ?? null),
    })),
    {
      label: "Variação",
      value: (r) => num(r.delta),
    },
    { label: "Tendência", value: (r) => r.trend ?? dash },
    { label: "Negativas (último)", value: (r) => pct(r.latestNegativesPct) },
  ];
  return columns;
}

export const yearColumns: ExportColumn<YearSummary>[] = [
  { label: "Ano lectivo", value: (y) => y.yearLabel },
  { label: "Alunos", value: (y) => y.students },
  { label: "Média final", value: (y) => num(y.average) },
  { label: "Transitaram", value: (y) => pct(y.passPct) },
  { label: "Não transitaram", value: (y) => pct(y.failPct) },
  {
    label: "Face ao anterior (pontos)",
    value: (y) => num(y.passDelta),
  },
];

type LevelRow = YearComparison["levels"][number];

export function levelColumns(yearLabels: string[]): ExportColumn<LevelRow>[] {
  return [
    { label: "Classe", value: (l) => l.gradeLevel },
    ...yearLabels.map((label) => ({
      label: `Transitaram ${label}`,
      value: (l: LevelRow) => pct(l.byYear[label] ?? null),
    })),
  ];
}
