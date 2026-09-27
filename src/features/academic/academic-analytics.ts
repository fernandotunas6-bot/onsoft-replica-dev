/**
 * Evolução entre períodos (puro): média e negativas por período, para turmas
 * ou disciplinas, e a variação entre os dois últimos períodos com notas.
 *
 * A nota de aprovação vem do modelo de avaliação (quem chama passa-a). O único
 * valor próprio é o limiar de "a subir / a descer": uma variação de 0,5
 * valores ou mais — abaixo disso, "estável". Está escrito no ecrã.
 */

export const TREND_THRESHOLD = 0.5;

export type AnalyticsGrade = {
  groupId: string;
  groupName: string;
  term: number;
  average: number;
};

export type TermCell = { average: number | null; negativesPct: number | null; count: number };

export type EvolutionRow = {
  id: string;
  name: string;
  terms: TermCell[];
  /** Variação entre o último período com notas e o anterior. */
  delta: number | null;
  trend: "a subir" | "a descer" | "estável" | null;
  /** Percentagem de negativas no último período com notas. */
  latestNegativesPct: number | null;
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export function termEvolution(
  grades: AnalyticsGrade[],
  passing: number,
  termCount = 3,
): EvolutionRow[] {
  const groups = new Map<string, { name: string; byTerm: Map<number, number[]> }>();
  for (const g of grades) {
    if (!Number.isFinite(g.average) || g.term < 1 || g.term > termCount) continue;
    const entry = groups.get(g.groupId) ?? { name: g.groupName, byTerm: new Map() };
    const list = entry.byTerm.get(g.term) ?? [];
    list.push(g.average);
    entry.byTerm.set(g.term, list);
    groups.set(g.groupId, entry);
  }

  const rows = [...groups.entries()].map(([id, { name, byTerm }]): EvolutionRow => {
    const terms: TermCell[] = Array.from({ length: termCount }, (_, i) => {
      const values = byTerm.get(i + 1) ?? [];
      if (!values.length) return { average: null, negativesPct: null, count: 0 };
      return {
        average: round1(values.reduce((a, b) => a + b, 0) / values.length),
        negativesPct: Math.round((values.filter((v) => v < passing).length / values.length) * 100),
        count: values.length,
      };
    });
    const withGrades = terms.filter((t) => t.average != null);
    const latest = withGrades[withGrades.length - 1] ?? null;
    const previous = withGrades[withGrades.length - 2] ?? null;
    const delta =
      latest && previous ? round1((latest.average as number) - (previous.average as number)) : null;
    return {
      id,
      name,
      terms,
      delta,
      trend:
        delta == null
          ? null
          : delta >= TREND_THRESHOLD
            ? "a subir"
            : delta <= -TREND_THRESHOLD
              ? "a descer"
              : "estável",
      latestNegativesPct: latest?.negativesPct ?? null,
    };
  });

  // Onde agir primeiro: as que mais desceram; depois as sem comparação, por nome.
  return rows.sort((a, b) => {
    if (a.delta == null && b.delta == null) return a.name.localeCompare(b.name, "pt");
    if (a.delta == null) return 1;
    if (b.delta == null) return -1;
    return a.delta - b.delta || a.name.localeCompare(b.name, "pt");
  });
}
