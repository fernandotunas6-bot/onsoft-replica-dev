import {
  angolaGradeScale,
  calculateDisciplineFinalAverage,
  getPeriodCountForCycle,
  normalizeScore,
  type AngolaTeachingCycle,
} from "@/lib/angola-academic";
import { decidePromotionStatus } from "./assessment-engine";
import { DEFAULT_PROMOTION_RULES, type PromotionRules } from "./assessment-model";

export type PautaGradeInput = {
  enrollment_id: string;
  subject_id: string;
  subject_name: string;
  term: number;
  average: number;
  student_name: string;
  registration_number: string | null;
  class_group_id: string | null;
};

export type PautaExportRow = {
  number: number;
  enrollment_id: string;
  student_name: string;
  registration_number: string | null;
  scores: Record<string, number | null>;
  average: number | null;
  situation: string;
};

/**
 * Regras da turma a exportar. Sem isto a pauta exportada decidia por sua conta — média
 * final com os períodos que houvesse e "Transita" com a média simples >= 10 — enquanto a
 * pauta oficial (`components/pautas/official-pauta.ts`) exige todos os períodos e aplica
 * `decidePromotionStatus`. Dois documentos da mesma turma podiam dizer o contrário.
 */
export type PautaExportRules = {
  /** Períodos que a turma tem de ter lançados para haver média final (2 ou 3). */
  periodCount?: 2 | 3;
  /** Ciclo da turma: decide a regra de transição (disciplinas em falta, exame, PAP). */
  cycle?: AngolaTeachingCycle | null;
  /** Nota mínima do modelo em vigor; sem modelo, a das Definições da escola. */
  passing?: number | null;
  /** Regras de transição do modelo em vigor. */
  promotionRules?: PromotionRules;
};

/**
 * Média final da disciplina para um documento: só com todos os períodos do regime
 * lançados. A mesma exigência de `calculateFinalDisciplineAverage` da pauta oficial —
 * uma pauta anual não pode mostrar a MFD de um ano a meio.
 */
function annualFinalAverage(terms: Array<number | null>, periodCount: 2 | 3): number | null {
  const required = terms.slice(0, periodCount);
  if (required.length < periodCount || required.some((value) => value == null)) return null;
  return calculateDisciplineFinalAverage(required[0], required[1], required[2] ?? null);
}

/** Uma linha por aluno; colunas = disciplinas; período = trimestre ou média anual (MFD). */
export function buildPautaExportRows(
  grades: ReadonlyArray<PautaGradeInput>,
  subjectIds: ReadonlyArray<string>,
  period: number | "anual",
  rules: PautaExportRules = {},
): PautaExportRow[] {
  const passing =
    rules.passing != null && Number.isFinite(rules.passing)
      ? rules.passing
      : angolaGradeScale.passing;
  const periodCount = rules.periodCount ?? getPeriodCountForCycle(rules.cycle ?? null);
  const wanted = new Set(subjectIds);
  const byStudent = new Map<
    string,
    { name: string; reg: string | null; terms: Map<string, Array<number | null>> }
  >();
  for (const g of grades) {
    if (!wanted.has(g.subject_id)) continue;
    if (period !== "anual" && g.term !== period) continue;
    const entry = byStudent.get(g.enrollment_id) ?? {
      name: g.student_name,
      reg: g.registration_number,
      terms: new Map(),
    };
    const list = entry.terms.get(g.subject_id) ?? [null, null, null];
    if (g.term >= 1 && g.term <= 3) list[g.term - 1] = normalizeScore(g.average);
    entry.terms.set(g.subject_id, list);
    byStudent.set(g.enrollment_id, entry);
  }
  const rows = [...byStudent.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name, "pt"))
    .map(([enrollmentId, entry], index) => {
      const scores: Record<string, number | null> = {};
      for (const id of subjectIds) {
        const t = entry.terms.get(id);
        scores[id] = !t
          ? null
          : period === "anual"
            ? annualFinalAverage(t, periodCount)
            : (t[period - 1] ?? null);
      }
      const values = Object.values(scores).filter((v): v is number => v != null);
      const average = values.length
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length + Number.EPSILON) * 10) / 10
        : null;
      return {
        number: index + 1,
        enrollment_id: enrollmentId,
        student_name: entry.name,
        registration_number: entry.reg,
        scores,
        average,
        situation: situationFor({ scores, subjectIds, average, period, passing, rules }),
      };
    });
  return rows;
}

/**
 * Trimestre: "Aprovado"/"Em recuperação" — a transição é uma decisão anual, e é este o
 * rótulo que o próprio ecrã de Relatórios Académicos já usa na tabela.
 *
 * Anual: o veredicto de transição do motor único (`decidePromotionStatus`), com a nota e
 * as regras do modelo em vigor. Com alguma disciplina sem média final o ano não está
 * fechado e não se decide nada — como na pauta oficial (`isComplete`).
 */
function situationFor({
  scores,
  subjectIds,
  average,
  period,
  passing,
  rules,
}: {
  scores: Record<string, number | null>;
  subjectIds: ReadonlyArray<string>;
  average: number | null;
  period: number | "anual";
  passing: number;
  rules: PautaExportRules;
}): string {
  if (average == null) return "—";
  if (period !== "anual") return average >= passing ? "Aprovado" : "Em recuperação";
  if (subjectIds.some((id) => scores[id] == null)) return "Pendente";
  const failing = subjectIds.filter((id) => (scores[id] as number) < passing).length;
  return decidePromotionStatus(average, failing, rules.cycle ?? "i_ciclo", null, {
    passing,
    rules: rules.promotionRules ?? DEFAULT_PROMOTION_RULES,
  });
}
