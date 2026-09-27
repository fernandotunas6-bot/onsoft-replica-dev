/**
 * Sinais automáticos de risco académico (puro, sem IA).
 *
 * Todos saem das regras do modelo de avaliação da escola — nota de aprovação,
 * regra de transição do ciclo e limite de faltas —, nunca de limiares
 * inventados. O único valor próprio é o aviso "perto do limite de faltas", a
 * 80% do limite do modelo, e está escrito no próprio sinal.
 */
import { decidePromotionStatus } from "./assessment-engine";
import type { PromotionRules } from "./assessment-model";

export const ABSENCE_WARNING_SHARE = 0.8;

export type WarningGrade = {
  subjectId: string;
  subjectName: string;
  term: number;
  average: number;
};

export type WarningStudent = {
  enrollmentId: string;
  name: string;
  grades: WarningGrade[];
  absencePercentage: number | null;
};

export type WarningRule = {
  passing: number;
  promotionRules: PromotionRules;
  maximumAbsencePercentage: number | null;
  cycle: string;
};

export type WarningSignal =
  | { kind: "would-not-pass"; label: string }
  | { kind: "turned-negative"; label: string; subjects: string[] }
  | { kind: "absences-over"; label: string }
  | { kind: "absences-near"; label: string };

export type StudentWarning = {
  enrollmentId: string;
  name: string;
  level: "alto" | "médio";
  average: number | null;
  negatives: number;
  signals: WarningSignal[];
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Média corrente por disciplina: média dos períodos com nota. */
function subjectAverages(grades: WarningGrade[]) {
  const bySubject = new Map<string, { name: string; values: number[] }>();
  for (const g of grades) {
    if (!Number.isFinite(g.average)) continue;
    const entry = bySubject.get(g.subjectId) ?? { name: g.subjectName, values: [] };
    entry.values.push(g.average);
    bySubject.set(g.subjectId, entry);
  }
  return [...bySubject.values()].map((s) => ({
    name: s.name,
    average: s.values.reduce((a, b) => a + b, 0) / s.values.length,
  }));
}

/** Disciplinas positivas no período anterior e negativas no último com nota. */
function turnedNegative(grades: WarningGrade[], passing: number) {
  const bySubject = new Map<string, { name: string; terms: Map<number, number> }>();
  for (const g of grades) {
    const entry = bySubject.get(g.subjectId) ?? { name: g.subjectName, terms: new Map() };
    entry.terms.set(g.term, g.average);
    bySubject.set(g.subjectId, entry);
  }
  const names: string[] = [];
  for (const { name, terms } of bySubject.values()) {
    const ordered = [...terms.entries()].sort((a, b) => a[0] - b[0]);
    if (ordered.length < 2) continue;
    const [, previous] = ordered[ordered.length - 2];
    const [, latest] = ordered[ordered.length - 1];
    if (previous >= passing && latest < passing) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b, "pt"));
}

export function studentWarnings(student: WarningStudent, rule: WarningRule): StudentWarning | null {
  const signals: WarningSignal[] = [];
  const subjects = subjectAverages(student.grades);
  const average = subjects.length
    ? round1(subjects.reduce((a, s) => a + s.average, 0) / subjects.length)
    : null;
  const negatives = subjects.filter((s) => s.average < rule.passing).length;

  if (average != null) {
    const status = decidePromotionStatus(average, negatives, rule.cycle as never, null, {
      passing: rule.passing,
      rules: rule.promotionRules,
    });
    if (status === "NÃO TRANSITA" || status === "ADMITIDO A EXAME") {
      signals.push({
        kind: "would-not-pass",
        label:
          status === "ADMITIDO A EXAME"
            ? `Com as notas actuais iria a exame (média ${average}, ${negatives} negativa(s))`
            : `Com as notas actuais não transitaria (média ${average}, ${negatives} negativa(s))`,
      });
    }
  }

  const turned = turnedNegative(student.grades, rule.passing);
  if (turned.length) {
    signals.push({
      kind: "turned-negative",
      label: `Passou a negativa em ${turned.join(", ")}`,
      subjects: turned,
    });
  }

  const limit = rule.maximumAbsencePercentage;
  const absence = student.absencePercentage;
  if (limit != null && absence != null) {
    if (absence > limit) {
      signals.push({
        kind: "absences-over",
        label: `Faltas acima do limite (${round1(absence)}% de ${limit}%)`,
      });
    } else if (absence >= limit * ABSENCE_WARNING_SHARE) {
      signals.push({
        kind: "absences-near",
        label: `Faltas perto do limite (${round1(absence)}% de ${limit}%)`,
      });
    }
  }

  if (!signals.length) return null;
  const level = signals.some((s) => s.kind === "would-not-pass" || s.kind === "absences-over")
    ? "alto"
    : "médio";
  return {
    enrollmentId: student.enrollmentId,
    name: student.name,
    level,
    average,
    negatives,
    signals,
  };
}

/** Alunos com sinais, os de risco alto primeiro. */
export function classWarnings(students: WarningStudent[], rule: WarningRule): StudentWarning[] {
  return students
    .map((s) => studentWarnings(s, rule))
    .filter((w): w is StudentWarning => w !== null)
    .sort(
      (a, b) =>
        (a.level === b.level ? 0 : a.level === "alto" ? -1 : 1) ||
        b.signals.length - a.signals.length ||
        a.name.localeCompare(b.name, "pt"),
    );
}
