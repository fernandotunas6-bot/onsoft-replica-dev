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

/* ------------------------------------------------------------------------ */
/* Comparativo entre anos lectivos (histórico académico oficial).           */
/* ------------------------------------------------------------------------ */

export type HistoryRecord = {
  yearLabel: string;
  gradeLevel: string;
  finalAverage: number | null;
  outcome: string | null;
};

export type OutcomeKind = "pass" | "fail" | "other";

/**
 * O histórico guarda a situação em texto ("Transitou", "Não transitou" e, em
 * registos antigos, "Aprovado", "Reprovado"…). A negação vem primeiro porque
 * "Não transitou" também contém "transit".
 */
export function outcomeKind(outcome: string | null): OutcomeKind {
  const o = (outcome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!o) return "other";
  if (/^nao\b|reprov|retid|exclu|chumb/.test(o)) return "fail";
  if (/transit|aprov/.test(o)) return "pass";
  return "other";
}

export type YearSummary = {
  yearLabel: string;
  students: number;
  average: number | null;
  passPct: number | null;
  failPct: number | null;
  /** Variação da taxa de transição face ao ano anterior da lista (pontos). */
  passDelta: number | null;
};

export type YearComparison = {
  years: YearSummary[];
  /** Taxa de transição por classe e ano: levels[i].byYear[yearLabel]. */
  levels: { gradeLevel: string; byYear: Record<string, number | null> }[];
};

type Acc = { count: number; sum: number; withAvg: number; pass: number; fail: number };
const emptyAcc = (): Acc => ({ count: 0, sum: 0, withAvg: 0, pass: 0, fail: 0 });

function addTo(acc: Acc, r: HistoryRecord) {
  acc.count += 1;
  if (r.finalAverage != null && Number.isFinite(r.finalAverage)) {
    acc.sum += r.finalAverage;
    acc.withAvg += 1;
  }
  const kind = outcomeKind(r.outcome);
  if (kind === "pass") acc.pass += 1;
  if (kind === "fail") acc.fail += 1;
}

/** Transição sobre os que têm situação decidida (transitou ou não). */
const passRate = (acc: Acc) =>
  acc.pass + acc.fail ? Math.round((acc.pass / (acc.pass + acc.fail)) * 100) : null;

/**
 * Resume o histórico por ano lectivo, pela ordem dada em `yearOrder` (do mais
 * antigo para o mais recente); anos sem ordem conhecida vão no fim, por nome.
 */
export function yearComparison(records: HistoryRecord[], yearOrder: string[] = []): YearComparison {
  const byYear = new Map<string, Acc>();
  const byLevel = new Map<string, Map<string, Acc>>();
  for (const r of records) {
    const year = r.yearLabel.trim();
    if (!year) continue;
    const yearAcc = byYear.get(year) ?? emptyAcc();
    addTo(yearAcc, r);
    byYear.set(year, yearAcc);
    const level = r.gradeLevel.trim() || "Sem classe";
    const levelMap = byLevel.get(level) ?? new Map<string, Acc>();
    const levelAcc = levelMap.get(year) ?? emptyAcc();
    addTo(levelAcc, r);
    levelMap.set(year, levelAcc);
    byLevel.set(level, levelMap);
  }

  const position = new Map(yearOrder.map((label, i) => [label.trim(), i]));
  const labels = [...byYear.keys()].sort((a, b) => {
    const pa = position.get(a);
    const pb = position.get(b);
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return a.localeCompare(b, "pt", { numeric: true });
  });

  let previousPass: number | null = null;
  const years = labels.map((yearLabel): YearSummary => {
    const acc = byYear.get(yearLabel)!;
    const decided = acc.pass + acc.fail;
    const passPct = passRate(acc);
    const summary: YearSummary = {
      yearLabel,
      students: acc.count,
      average: acc.withAvg ? round1(acc.sum / acc.withAvg) : null,
      passPct,
      failPct: decided ? 100 - (passPct as number) : null,
      passDelta: passPct != null && previousPass != null ? passPct - previousPass : null,
    };
    if (passPct != null) previousPass = passPct;
    return summary;
  });

  const levels = [...byLevel.entries()]
    .map(([gradeLevel, map]) => ({
      gradeLevel,
      byYear: Object.fromEntries(
        labels.map((y) => [y, map.has(y) ? passRate(map.get(y)!) : null]),
      ) as Record<string, number | null>,
    }))
    .sort((a, b) => a.gradeLevel.localeCompare(b.gradeLevel, "pt", { numeric: true }));

  return { years, levels };
}
