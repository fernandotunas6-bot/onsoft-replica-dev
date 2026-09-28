/**
 * Inscrição por unidade curricular (ensino superior): regras puras.
 *
 * Cada estudante inscreve-se nas cadeiras do seu curso, incluindo as que
 * ficaram em atraso. O servidor (course-units-server.ts) lê os dados e chama
 * estas funções; aqui decide-se o que está disponível, o que falta para
 * poder inscrever-se e os créditos acumulados. As regras vêm do regulamento
 * da instituição (higher-ed-regulation.ts).
 */
import {
  canEnrollCredits,
  unitOutcome,
  yearProgression,
  type HigherEdRegulation,
  type UnitOutcome,
} from "./higher-ed-regulation";

export type CourseUnitStatus =
  | "inscrito"
  | "dispensado"
  | "aprovado"
  | "reprovado"
  | "excluido_faltas"
  | "excluido_frequencia"
  | "anulado";

export const PASSED_STATUSES: readonly CourseUnitStatus[] = ["aprovado", "dispensado"];

export const COURSE_UNIT_STATUS_LABELS: Record<CourseUnitStatus, string> = {
  inscrito: "Inscrito",
  dispensado: "Dispensado",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  excluido_faltas: "Excluído por faltas",
  excluido_frequencia: "Excluído na frequência",
  anulado: "Anulado",
};

export type CurriculumUnit = {
  programSubjectId: string;
  subjectName: string;
  semester: number;
  credits: number;
  /** Unidades curriculares que têm de estar aprovadas antes. */
  prerequisites: string[];
};

export type UnitEnrollment = {
  id: string;
  programSubjectId: string;
  academicYearId: string;
  status: CourseUnitStatus;
  finalGrade: number | null;
  credits: number;
  creditsEarned: number;
  attempt: number;
};

/** Situação de cada cadeira do plano para um estudante, no ano indicado. */
export type UnitSituation =
  | { kind: "aprovada"; grade: number | null }
  | { kind: "inscrita"; enrollmentId: string; attempt: number }
  | { kind: "disponivel"; attempt: number; lateUnit: boolean }
  | { kind: "bloqueada"; missing: string[] };

const isPassed = (status: CourseUnitStatus) => PASSED_STATUSES.includes(status);

/**
 * Para cada cadeira do plano: aprovada, inscrita neste ano, disponível ou
 * bloqueada por precedências. `currentSemesterLimit` é o último semestre do
 * ano curricular do estudante: as cadeiras até lá e não aprovadas contam
 * como "em atraso" quando são de semestres anteriores.
 */
export function unitSituations(
  reg: HigherEdRegulation,
  input: {
    units: CurriculumUnit[];
    enrollments: UnitEnrollment[];
    academicYearId: string;
    firstSemesterOfYear: number;
  },
): Map<string, UnitSituation> {
  const passed = new Map<string, number | null>();
  const attempts = new Map<string, number>();
  const currentYear = new Map<string, UnitEnrollment>();
  for (const e of input.enrollments) {
    if (e.status === "anulado") continue;
    attempts.set(e.programSubjectId, Math.max(attempts.get(e.programSubjectId) ?? 0, e.attempt));
    if (isPassed(e.status)) passed.set(e.programSubjectId, e.finalGrade);
    if (e.academicYearId === input.academicYearId) currentYear.set(e.programSubjectId, e);
  }

  const result = new Map<string, UnitSituation>();
  for (const unit of input.units) {
    if (passed.has(unit.programSubjectId)) {
      result.set(unit.programSubjectId, {
        kind: "aprovada",
        grade: passed.get(unit.programSubjectId) ?? null,
      });
      continue;
    }
    const current = currentYear.get(unit.programSubjectId);
    if (current) {
      result.set(unit.programSubjectId, {
        kind: "inscrita",
        enrollmentId: current.id,
        attempt: current.attempt,
      });
      continue;
    }
    const missing = unit.prerequisites.filter((id) => !passed.has(id));
    if (reg.enforcePrerequisites && missing.length) {
      result.set(unit.programSubjectId, { kind: "bloqueada", missing });
      continue;
    }
    result.set(unit.programSubjectId, {
      kind: "disponivel",
      attempt: (attempts.get(unit.programSubjectId) ?? 0) + 1,
      lateUnit: unit.semester < input.firstSemesterOfYear,
    });
  }
  return result;
}

/** Créditos em que o estudante já está inscrito num ano (anuladas não contam). */
export function enrolledCredits(enrollments: UnitEnrollment[], academicYearId: string) {
  return enrollments
    .filter((e) => e.academicYearId === academicYearId && e.status !== "anulado")
    .reduce((total, e) => total + e.credits, 0);
}

/** Créditos obtidos no curso (cadeiras aprovadas ou dispensadas). */
export function earnedCredits(enrollments: UnitEnrollment[]) {
  const best = new Map<string, number>();
  for (const e of enrollments) {
    if (!isPassed(e.status)) continue;
    best.set(e.programSubjectId, Math.max(best.get(e.programSubjectId) ?? 0, e.creditsEarned));
  }
  return [...best.values()].reduce((total, credits) => total + credits, 0);
}

export type EnrollmentCheck = { ok: true } | { ok: false; reason: string };

/**
 * Pode inscrever-se nestas cadeiras? Recusa o que já está aprovado ou inscrito,
 * o que falha as precedências (se o regulamento as exige) e o que passa o
 * limite de créditos do ano.
 */
export function checkUnitEnrollment(
  reg: HigherEdRegulation,
  situations: Map<string, UnitSituation>,
  units: CurriculumUnit[],
  requested: string[],
  alreadyEnrolledCredits: number,
): EnrollmentCheck {
  const byId = new Map(units.map((unit) => [unit.programSubjectId, unit]));
  let credits = alreadyEnrolledCredits;
  for (const id of requested) {
    const unit = byId.get(id);
    if (!unit) return { ok: false, reason: "Esta cadeira não pertence ao plano do curso." };
    const situation = situations.get(id);
    if (situation?.kind === "aprovada") {
      return { ok: false, reason: `${unit.subjectName} já está aprovada.` };
    }
    if (situation?.kind === "inscrita") {
      return { ok: false, reason: `Já está inscrito em ${unit.subjectName} este ano.` };
    }
    if (situation?.kind === "bloqueada") {
      const names = situation.missing.map((m) => byId.get(m)?.subjectName ?? "—").join(", ");
      return { ok: false, reason: `${unit.subjectName} exige aprovação em: ${names}.` };
    }
    if (!canEnrollCredits(reg, credits, unit.credits)) {
      return {
        ok: false,
        reason: `Passa o limite de ${reg.maxCreditsPerYear} ECTS por ano com ${unit.subjectName}.`,
      };
    }
    credits += unit.credits;
  }
  return { ok: true };
}

/** O que gravar na inscrição a partir das notas lançadas. */
export function outcomeToRecord(outcome: UnitOutcome, credits: number) {
  const status: CourseUnitStatus =
    outcome.status === "pendente" || outcome.status === "admitido" ? "inscrito" : outcome.status;
  return {
    status,
    final_grade: outcome.finalGrade,
    season: outcome.season,
    credits_earned: isPassed(status) ? credits : 0,
  };
}

/** Resultado da cadeira segundo o regulamento, pronto a gravar. */
export function gradeUnit(
  reg: HigherEdRegulation,
  credits: number,
  grades: Parameters<typeof unitOutcome>[1],
) {
  return outcomeToRecord(unitOutcome(reg, grades), credits);
}

/** Resumo do percurso: créditos obtidos, do plano e se transita. */
export function studentProgress(
  reg: HigherEdRegulation,
  units: CurriculumUnit[],
  enrollments: UnitEnrollment[],
  academicYearId: string,
) {
  const earned = earnedCredits(enrollments);
  const planCredits = units.reduce((total, unit) => total + unit.credits, 0);
  const yearEarned = enrollments
    .filter((e) => e.academicYearId === academicYearId && isPassed(e.status))
    .reduce((total, e) => total + e.creditsEarned, 0);
  return {
    earned,
    planCredits,
    enrolledThisYear: enrolledCredits(enrollments, academicYearId),
    progression: yearProgression(reg, yearEarned),
  };
}

/** Há algum ciclo nas precedências (A exige B, B exige A)? */
export function hasPrerequisiteCycle(graph: Map<string, string[]>): boolean {
  const state = new Map<string, "visiting" | "done">();
  const visit = (node: string): boolean => {
    const current = state.get(node);
    if (current === "visiting") return true;
    if (current === "done") return false;
    state.set(node, "visiting");
    for (const next of graph.get(node) ?? []) if (visit(next)) return true;
    state.set(node, "done");
    return false;
  };
  return [...graph.keys()].some(visit);
}
