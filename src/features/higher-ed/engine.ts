/**
 * Motor de regras do Ensino Superior — funções puras, sem base de dados.
 *
 * Modelo (tabelas que já existem na produção):
 * - program_subjects: o plano curricular do curso — cada unidade curricular
 *   (cadeira) com o semestre curricular (1.º, 2.º, … do curso) e os créditos.
 * - program_subject_prerequisites: precedências entre cadeiras do plano.
 * - course_unit_enrollments: cada inscrição numa cadeira (ano lectivo,
 *   semestre, tentativa, época, estado, nota final, créditos obtidos).
 *
 * As regras numéricas vêm do regulamento da instituição (HigherEdRegulation,
 * em Definições), nunca fixas aqui.
 */
import {
  calculateComponentGrade,
  calculateCreditWeightedAverage,
  calculateGpa,
} from "@/features/academic/grading-profiles";
import type { HigherEdRegulation } from "@/features/school/settings-domains";
import { normalizeScore } from "@/lib/angola-academic";

export type PlanUnit = {
  /** program_subjects.id */
  id: string;
  subjectId: string;
  name: string;
  /** Semestre curricular no curso (1, 2, 3, …). */
  semester: number;
  credits: number;
};

export type Prerequisite = { unitId: string; requiresUnitId: string };

export const ENROLLMENT_STATUSES = [
  "inscrito",
  "aprovado",
  "reprovado",
  "dispensado",
  "anulado",
  "excluido_faltas",
  "excluido_frequencia",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const EXAM_SEASONS = ["frequencia", "normal", "recurso", "especial", "melhoria"] as const;
export type ExamSeason = (typeof EXAM_SEASONS)[number];

export type UnitRecord = {
  unitId: string;
  academicYearId: string;
  attempt: number;
  status: EnrollmentStatus;
  season: ExamSeason | null;
  finalGrade: number | null;
  credits: number;
  creditsEarned: number;
  /** Para ordenar tentativas da mesma cadeira; ISO. */
  updatedAt?: string;
};

/** Aprovada (com nota) ou dispensada (creditação/equivalência): conta para o curso. */
export const isCompleted = (status: EnrollmentStatus) =>
  status === "aprovado" || status === "dispensado";

/** Uma tentativa que conta para o limite: terminou sem aprovação. */
const isFailedAttempt = (status: EnrollmentStatus) =>
  status === "reprovado" || status === "excluido_faltas" || status === "excluido_frequencia";

/** Semestre lectivo (1.º ou 2.º do ano) a partir do semestre curricular do curso. */
export const academicSemesterOf = (curricularSemester: number) =>
  curricularSemester % 2 === 1 ? 1 : 2;

/** Ano curricular (1.º ano = semestres 1 e 2, …). */
export const curricularYearOf = (curricularSemester: number) =>
  Math.ceil(Math.max(1, curricularSemester) / 2);

// ── Plano curricular ───────────────────────────────────────────────────────

export type PlanIssue = {
  level: "error" | "warning";
  code:
    | "duplicate_subject"
    | "invalid_credits"
    | "invalid_semester"
    | "unknown_prerequisite"
    | "self_prerequisite"
    | "prerequisite_not_earlier"
    | "prerequisite_cycle";
  message: string;
  unitId?: string;
};

export function validatePlan(units: PlanUnit[], prerequisites: Prerequisite[]): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const seenSubjects = new Map<string, PlanUnit>();

  for (const unit of units) {
    // Decreto Presidencial 193/18: cada unidade curricular tem de 1 a 20 unidades de crédito.
    if (!(unit.credits >= 1 && unit.credits <= 20)) {
      issues.push({
        level: "error",
        code: "invalid_credits",
        unitId: unit.id,
        message: `«${unit.name}» tem ${unit.credits} créditos; cada cadeira tem de 1 a 20 (Decreto Presidencial 193/18).`,
      });
    }
    if (!Number.isInteger(unit.semester) || unit.semester < 1 || unit.semester > 14) {
      issues.push({
        level: "error",
        code: "invalid_semester",
        unitId: unit.id,
        message: `«${unit.name}» tem um semestre inválido.`,
      });
    }
    const previous = seenSubjects.get(unit.subjectId);
    if (previous) {
      issues.push({
        level: "error",
        code: "duplicate_subject",
        unitId: unit.id,
        message: `«${unit.name}» aparece duas vezes no plano (semestres ${previous.semester} e ${unit.semester}).`,
      });
    } else {
      seenSubjects.set(unit.subjectId, unit);
    }
  }

  for (const link of prerequisites) {
    const unit = byId.get(link.unitId);
    const required = byId.get(link.requiresUnitId);
    if (!unit || !required) {
      issues.push({
        level: "error",
        code: "unknown_prerequisite",
        unitId: link.unitId,
        message: "Há uma precedência para uma cadeira que já não está no plano.",
      });
      continue;
    }
    if (unit.id === required.id) {
      issues.push({
        level: "error",
        code: "self_prerequisite",
        unitId: unit.id,
        message: `«${unit.name}» não pode ser precedência de si própria.`,
      });
      continue;
    }
    if (required.semester >= unit.semester) {
      issues.push({
        level: "warning",
        code: "prerequisite_not_earlier",
        unitId: unit.id,
        message: `«${unit.name}» (semestre ${unit.semester}) exige «${required.name}», que não é de um semestre anterior (${required.semester}).`,
      });
    }
  }

  for (const cycle of findPrerequisiteCycles(units, prerequisites)) {
    issues.push({
      level: "error",
      code: "prerequisite_cycle",
      unitId: cycle[0],
      message: `Precedências em círculo: ${cycle.map((id) => byId.get(id)?.name ?? id).join(" → ")}.`,
    });
  }
  return issues;
}

/** Ciclos no grafo de precedências (cada ciclo devolvido uma vez). */
export function findPrerequisiteCycles(units: PlanUnit[], prerequisites: Prerequisite[]) {
  const edges = new Map<string, string[]>();
  for (const link of prerequisites) {
    if (link.unitId === link.requiresUnitId) continue;
    edges.set(link.unitId, [...(edges.get(link.unitId) ?? []), link.requiresUnitId]);
  }
  const state = new Map<string, "visiting" | "done">();
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string) => {
    state.set(id, "visiting");
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      if (state.get(next) === "visiting") {
        const cycle = [...stack.slice(stack.indexOf(next)), next];
        const key = [...new Set(cycle)].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(id, "done");
  };
  for (const unit of units) if (!state.has(unit.id)) visit(unit.id);
  return cycles;
}

export function planTotals(units: PlanUnit[]) {
  const bySemester = new Map<number, number>();
  for (const unit of units) {
    bySemester.set(unit.semester, (bySemester.get(unit.semester) ?? 0) + unit.credits);
  }
  const semesters = [...bySemester.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([semester, credits]) => ({ semester, credits }));
  return {
    totalCredits: units.reduce((sum, unit) => sum + unit.credits, 0),
    semesters,
    years: Math.max(0, ...units.map((unit) => curricularYearOf(unit.semester))),
  };
}

// ── Histórico do estudante ────────────────────────────────────────────────

/** A última tentativa de cada cadeira (por ordem de tentativa, depois de data). */
export function latestRecordByUnit(records: UnitRecord[]) {
  const latest = new Map<string, UnitRecord>();
  for (const record of records) {
    const current = latest.get(record.unitId);
    if (
      !current ||
      record.attempt > current.attempt ||
      (record.attempt === current.attempt && (record.updatedAt ?? "") > (current.updatedAt ?? ""))
    ) {
      latest.set(record.unitId, record);
    }
  }
  return latest;
}

/** Cadeiras concluídas: qualquer tentativa aprovada ou dispensada conta. */
export function completedUnitIds(records: UnitRecord[]) {
  return new Set(records.filter((r) => isCompleted(r.status)).map((r) => r.unitId));
}

// ── Inscrição ──────────────────────────────────────────────────────────────

export type EnrollmentCheck = { ok: boolean; reasons: string[] };

/**
 * Pode inscrever-se nesta cadeira? Não pode se já a concluiu, se está inscrito
 * nela agora, se faltam precedências ou se esgotou as tentativas.
 */
export function checkUnitEnrollment(params: {
  unit: PlanUnit;
  plan: PlanUnit[];
  prerequisites: Prerequisite[];
  records: UnitRecord[];
  regulation: HigherEdRegulation;
  academicYearId: string;
}): EnrollmentCheck {
  const { unit, plan, prerequisites, records, regulation, academicYearId } = params;
  const reasons: string[] = [];
  const completed = completedUnitIds(records);
  const names = new Map(plan.map((u) => [u.id, u.name]));

  if (completed.has(unit.id)) reasons.push(`«${unit.name}» já está concluída.`);
  if (
    records.some(
      (r) => r.unitId === unit.id && r.academicYearId === academicYearId && r.status === "inscrito",
    )
  ) {
    reasons.push(`Já está inscrito em «${unit.name}» neste ano lectivo.`);
  }
  if (
    records.some(
      (r) => r.unitId === unit.id && r.academicYearId !== academicYearId && r.status === "inscrito",
    )
  ) {
    reasons.push(
      `«${unit.name}» tem uma inscrição de outro ano lectivo sem resultado: lance-o ou anule-a primeiro.`,
    );
  }
  const missing = prerequisites
    .filter((link) => link.unitId === unit.id && !completed.has(link.requiresUnitId))
    .map((link) => names.get(link.requiresUnitId) ?? "cadeira do plano");
  if (missing.length) reasons.push(`Precedências por concluir: ${missing.join(", ")}.`);

  if (regulation.max_attempts > 0) {
    const failed = records.filter((r) => r.unitId === unit.id && isFailedAttempt(r.status)).length;
    if (failed >= regulation.max_attempts) {
      reasons.push(
        `Esgotou as ${regulation.max_attempts} tentativas permitidas em «${unit.name}».`,
      );
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Valida um conjunto de inscrições de um ano lectivo: cada cadeira e os
 * limites de créditos por ano e por semestre lectivo (contando o que o
 * estudante já tem inscrito nesse ano).
 */
export function checkEnrollmentBatch(params: {
  selected: PlanUnit[];
  plan: PlanUnit[];
  prerequisites: Prerequisite[];
  records: UnitRecord[];
  regulation: HigherEdRegulation;
  academicYearId: string;
}) {
  const { selected, records, regulation, academicYearId, plan } = params;
  const perUnit = new Map(
    selected.map((unit) => [unit.id, checkUnitEnrollment({ ...params, unit })] as const),
  );

  const alreadyThisYear = records.filter(
    (r) => r.academicYearId === academicYearId && r.status === "inscrito",
  );
  const unitById = new Map(plan.map((u) => [u.id, u]));
  const creditsBySemester = { 1: 0, 2: 0 } as Record<1 | 2, number>;
  for (const record of alreadyThisYear) {
    const unit = unitById.get(record.unitId);
    if (unit) creditsBySemester[academicSemesterOf(unit.semester) as 1 | 2] += record.credits;
  }
  for (const unit of selected) {
    creditsBySemester[academicSemesterOf(unit.semester) as 1 | 2] += unit.credits;
  }
  const yearCredits = creditsBySemester[1] + creditsBySemester[2];

  const limits: string[] = [];
  if (yearCredits > regulation.max_credits_per_year) {
    limits.push(
      `${yearCredits} créditos no ano ultrapassam o máximo de ${regulation.max_credits_per_year}.`,
    );
  }
  for (const semester of [1, 2] as const) {
    if (creditsBySemester[semester] > regulation.max_credits_per_semester) {
      limits.push(
        `${creditsBySemester[semester]} créditos no ${semester}.º semestre ultrapassam o máximo de ${regulation.max_credits_per_semester}.`,
      );
    }
  }
  const ok = limits.length === 0 && [...perUnit.values()].every((check) => check.ok);
  return { ok, perUnit, limits, yearCredits, creditsBySemester };
}

// ── Avaliação e épocas ────────────────────────────────────────────────────

export type FrequencyOutcome =
  | { kind: "excluido_faltas" }
  | { kind: "excluido_frequencia"; frequency: number }
  | { kind: "dispensado_exame"; grade: number }
  | { kind: "admitido"; frequency: number }
  | { kind: "sem_nota" };

/**
 * Depois da frequência: excluído por faltas, excluído por frequência
 * insuficiente, dispensado de exame (aprovado com a nota de frequência) ou
 * admitido a exame.
 */
export function frequencyOutcome(
  frequency: number | null | undefined,
  absencePercent: number | null | undefined,
  regulation: HigherEdRegulation,
): FrequencyOutcome {
  if (
    regulation.max_absence_percent > 0 &&
    (absencePercent ?? 0) > regulation.max_absence_percent
  ) {
    return { kind: "excluido_faltas" };
  }
  const value = normalizeScore(frequency);
  if (value === null) return { kind: "sem_nota" };
  if (value < regulation.exam_admission_min)
    return { kind: "excluido_frequencia", frequency: value };
  if (regulation.exam_exemption_min > 0 && value >= regulation.exam_exemption_min) {
    return { kind: "dispensado_exame", grade: value };
  }
  return { kind: "admitido", frequency: value };
}

/**
 * A que épocas pode ir o estudante nesta cadeira.
 * - normal: admitido a exame (frequência lançada, inscrição em curso);
 * - recurso: reprovou na época normal (os excluídos não vão a recurso);
 * - especial: finalista (até `special_season_max_units` cadeiras por concluir), em
 *   cadeira reprovada ou com exclusão por frequência;
 * - melhoria: já aprovou e a instituição permite melhoria (uma vez por cadeira).
 */
export function seasonEligibility(params: {
  unitId: string;
  records: UnitRecord[];
  plan: PlanUnit[];
  regulation: HigherEdRegulation;
}) {
  const { unitId, records, plan, regulation } = params;
  const unitRecords = records.filter((r) => r.unitId === unitId);
  const latest = latestRecordByUnit(unitRecords).get(unitId);
  const completed = completedUnitIds(records);
  const pending = plan.filter((unit) => !completed.has(unit.id)).length;
  const done = completed.has(unitId);

  // Normal: admitido a exame — frequência já lançada e a inscrição ainda em curso.
  const normal = !done && latest?.status === "inscrito" && latest.season === "frequencia";
  const recurso =
    !done &&
    latest?.status === "reprovado" &&
    (latest.season === "normal" || latest.season === "frequencia");
  // Especial: finalista, numa cadeira que reprovou (ou de que foi excluído por
  // frequência). Excluído por faltas não vai; uma cadeira ainda em curso também não.
  const especial =
    !done &&
    pending > 0 &&
    pending <= regulation.special_season_max_units &&
    (latest?.status === "reprovado" || latest?.status === "excluido_frequencia");
  const melhoria =
    regulation.improvement_enabled &&
    unitRecords.some((r) => r.status === "aprovado") &&
    !unitRecords.some((r) => r.season === "melhoria");
  return { normal, recurso, especial, melhoria, pendingUnits: pending };
}

/**
 * Nota final e estado de uma época.
 * - normal: média ponderada frequência/exame (peso do regulamento);
 * - recurso e especial: a nota do exame;
 * - melhoria: a melhor entre a nota anterior e a do exame (nunca baixa).
 */
export function seasonResult(params: {
  season: Exclude<ExamSeason, "frequencia">;
  frequency: number | null | undefined;
  exam: number | null | undefined;
  previousGrade?: number | null;
  regulation: HigherEdRegulation;
}): { status: "aprovado" | "reprovado"; finalGrade: number | null } {
  const { season, frequency, exam, previousGrade, regulation } = params;
  let grade: number | null;
  if (season === "normal") {
    grade = calculateComponentGrade("frequencia_exame", frequency, exam, {
      frequencia: regulation.frequency_weight,
      exame: 1 - regulation.frequency_weight,
    });
  } else {
    grade = normalizeScore(exam);
  }
  if (season === "melhoria") {
    const previous = normalizeScore(previousGrade);
    if (previous !== null && (grade === null || grade < previous)) grade = previous;
  }
  const status = grade !== null && grade >= regulation.passing_grade ? "aprovado" : "reprovado";
  return { status, finalGrade: grade };
}

// ── Progressão ─────────────────────────────────────────────────────────────

export function studentProgress(params: {
  plan: PlanUnit[];
  records: UnitRecord[];
  regulation: HigherEdRegulation;
}) {
  const { plan, records, regulation } = params;
  const completed = completedUnitIds(records);
  const creditsTotal = plan.reduce((sum, unit) => sum + unit.credits, 0);
  const creditsEarned = plan
    .filter((unit) => completed.has(unit.id))
    .reduce((sum, unit) => sum + unit.credits, 0);

  // Média: melhor nota aprovada de cada cadeira, ponderada pelos créditos.
  // As dispensadas (creditação) contam créditos mas não entram na média.
  const bestGrade = new Map<string, number>();
  for (const record of records) {
    if (record.status !== "aprovado" || record.finalGrade === null) continue;
    bestGrade.set(record.unitId, Math.max(bestGrade.get(record.unitId) ?? 0, record.finalGrade));
  }
  const graded = plan
    .filter((unit) => bestGrade.has(unit.id))
    .map((unit) => ({ score: bestGrade.get(unit.id)!, credits: unit.credits }));

  const pendingUnits = plan.filter((unit) => !completed.has(unit.id));
  const yearsInPlan = Math.max(1, ...plan.map((unit) => curricularYearOf(unit.semester)));
  const curricularYear = Math.min(
    yearsInPlan,
    Math.floor(creditsEarned / Math.max(1, regulation.max_credits_per_year)) + 1,
  );
  return {
    creditsEarned,
    creditsTotal,
    percent: creditsTotal ? Math.round((creditsEarned / creditsTotal) * 100) : 0,
    average: calculateCreditWeightedAverage(graded),
    gpa: calculateGpa(graded),
    curricularYear,
    pendingUnits,
    finalist: pendingUnits.length > 0 && pendingUnits.length <= regulation.special_season_max_units,
    completed: plan.length > 0 && pendingUnits.length === 0,
  };
}

export type TranscriptLine = {
  unit: PlanUnit;
  state: "concluida" | "creditada" | "em_curso" | "por_fazer";
  grade: number | null;
  season: ExamSeason | null;
  academicYearId: string | null;
  attempts: number;
  /** Último estado registado, quando a cadeira ainda não está concluída. */
  lastStatus: EnrollmentStatus | null;
};

/**
 * Linhas do histórico académico, pela ordem do plano: a melhor aprovação de
 * cada cadeira (ou a creditação), senão o último estado. As anuladas não contam
 * como tentativa.
 */
export function transcriptLines(plan: PlanUnit[], records: UnitRecord[]): TranscriptLine[] {
  const latest = latestRecordByUnit(records);
  return [...plan]
    .sort((a, b) => a.semester - b.semester || a.name.localeCompare(b.name, "pt"))
    .map((unit) => {
      const unitRecords = records.filter((r) => r.unitId === unit.id);
      const attempts = unitRecords.filter((r) => r.status !== "anulado").length;
      const best = unitRecords
        .filter((r) => r.status === "aprovado")
        .sort((a, b) => (b.finalGrade ?? 0) - (a.finalGrade ?? 0))[0];
      if (best) {
        return {
          unit,
          state: "concluida" as const,
          grade: best.finalGrade,
          season: best.season,
          academicYearId: best.academicYearId,
          attempts,
          lastStatus: null,
        };
      }
      const credited = unitRecords.find((r) => r.status === "dispensado");
      if (credited) {
        return {
          unit,
          state: "creditada" as const,
          grade: null,
          season: null,
          academicYearId: credited.academicYearId,
          attempts,
          lastStatus: null,
        };
      }
      const last = latest.get(unit.id);
      return {
        unit,
        state: last && last.status !== "anulado" ? ("em_curso" as const) : ("por_fazer" as const),
        grade: null,
        season: last?.season ?? null,
        academicYearId: last?.academicYearId ?? null,
        attempts,
        lastStatus: last?.status ?? null,
      };
    });
}

/**
 * Inscrição em lote de um estudante nas cadeiras de um semestre do plano: fica
 * com as que pode fazer (precedências, tentativas, não concluídas nem já em
 * curso) até onde os limites de créditos deixam; o resto vem com o motivo.
 */
export function planCohortEnrollment(params: {
  candidates: PlanUnit[];
  plan: PlanUnit[];
  prerequisites: Prerequisite[];
  records: UnitRecord[];
  regulation: HigherEdRegulation;
  academicYearId: string;
}) {
  const { candidates, ...rest } = params;
  const first = checkEnrollmentBatch({ ...rest, selected: candidates });
  const selected: PlanUnit[] = [];
  const skipped: Array<{ unit: PlanUnit; reasons: string[] }> = [];
  for (const unit of candidates) {
    const check = first.perUnit.get(unit.id);
    if (!check?.ok) {
      skipped.push({ unit, reasons: check?.reasons ?? [] });
      continue;
    }
    const attempt = checkEnrollmentBatch({ ...rest, selected: [...selected, unit] });
    if (attempt.limits.length) {
      skipped.push({ unit, reasons: attempt.limits });
      continue;
    }
    selected.push(unit);
  }
  return { selected, skipped };
}

export type FinalMention = "Suficiente" | "Bom" | "Bom com distinção" | "Muito Bom" | "Excelente";

/**
 * Classificação final de curso (Decreto Presidencial 257/25): a média ponderada
 * das unidades curriculares, expressa em número inteiro de 10 a 20, com a menção
 * qualitativa correspondente (10–13 Suficiente, 14–15 Bom, 16–17 Bom com
 * distinção, 18–19 Muito Bom, 20 Excelente). Arredonda às unidades (x,5 sobe).
 */
export function finalClassification(average: number | null): {
  value: number;
  mention: FinalMention;
} | null {
  if (average === null || !Number.isFinite(average)) return null;
  const value = Math.min(20, Math.max(10, Math.floor(average + 0.5)));
  const mention: FinalMention =
    value >= 20
      ? "Excelente"
      : value >= 18
        ? "Muito Bom"
        : value >= 16
          ? "Bom com distinção"
          : value >= 14
            ? "Bom"
            : "Suficiente";
  return { value, mention };
}

export type AcademicStanding =
  "regular" | "em_atraso" | "em_risco" | "prazo_excedido" | "concluido";

/**
 * Situação académica (como o «academic standing» do Banner e a prescrição do
 * SIGARRA): créditos obtidos face aos esperados para os anos já frequentados
 * (as cadeiras do plano até ao semestre 2 × anos), e anos além da duração do
 * curso. Os limites vêm do regulamento; 0 desliga cada regra.
 */
export function academicStanding(params: {
  plan: PlanUnit[];
  records: UnitRecord[];
  regulation: HigherEdRegulation;
}) {
  const { plan, records, regulation } = params;
  const progress = studentProgress({ plan, records, regulation });
  const yearsAttended = new Set(
    records.filter((r) => r.status !== "anulado" && r.academicYearId).map((r) => r.academicYearId),
  ).size;
  const planYears = Math.max(1, ...plan.map((unit) => curricularYearOf(unit.semester)));
  const expectedCredits = plan
    .filter((unit) => unit.semester <= yearsAttended * 2)
    .reduce((sum, unit) => sum + unit.credits, 0);
  const ratio = expectedCredits > 0 ? (progress.creditsEarned / expectedCredits) * 100 : 100;
  let standing: AcademicStanding = "regular";
  if (progress.completed) standing = "concluido";
  else if (regulation.max_extra_years > 0 && yearsAttended > planYears + regulation.max_extra_years)
    standing = "prazo_excedido";
  else if (regulation.standing_risk_percent > 0 && ratio < regulation.standing_risk_percent)
    standing = "em_risco";
  else if (regulation.standing_delay_percent > 0 && ratio < regulation.standing_delay_percent)
    standing = "em_atraso";
  return {
    standing,
    yearsAttended,
    planYears,
    expectedCredits,
    creditsEarned: progress.creditsEarned,
    percentOfExpected: Math.round(ratio),
    /** «O que falta para concluir» (degree audit): cadeiras e créditos em falta. */
    missing: progress.pendingUnits.map((unit) => ({
      id: unit.id,
      name: unit.name,
      semester: unit.semester,
      credits: unit.credits,
    })),
    missingCredits: progress.pendingUnits.reduce((sum, unit) => sum + unit.credits, 0),
  };
}

/** Período de inscrições (como os calendários de inscrição do FenixEdu/SIGAA). */
export function enrollmentWindowError(
  regulation: Pick<HigherEdRegulation, "enrollment_opens_on" | "enrollment_closes_on">,
  today: string,
): string | null {
  if (regulation.enrollment_opens_on && today < regulation.enrollment_opens_on) {
    return `As inscrições em cadeiras abrem a ${regulation.enrollment_opens_on}.`;
  }
  if (regulation.enrollment_closes_on && today > regulation.enrollment_closes_on) {
    return `As inscrições em cadeiras fecharam a ${regulation.enrollment_closes_on}.`;
  }
  return null;
}

/** Anulação fora do prazo (dias após o início do semestre da inscrição). */
export function cancellationIsLate(
  deadlineDays: number,
  semesterStartsOn: string | null,
  today: string,
): boolean {
  if (!deadlineDays || !semesterStartsOn) return false;
  const limit = new Date(`${semesterStartsOn}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + deadlineDays);
  return today > limit.toISOString().slice(0, 10);
}

/** Decisão do júri de doutoramento (Decreto Presidencial 257/25). */
export const DOCTORAL_MENTIONS = {
  aprovado: "Aprovado",
  distincao: "Aprovado com distinção",
  distincao_louvor: "Aprovado com distinção e louvor",
} as const;
export type DoctoralMention = keyof typeof DOCTORAL_MENTIONS;

const JURY_PREFIX = "júri:";

export function encodeJuryDecision(mention: DoctoralMention, note: string) {
  return `${JURY_PREFIX}${mention}|${note}`;
}

/** Lê a decisão do júri gravada nas notas da inscrição da tese (ou null). */
export function decodeJuryDecision(notes: string | null | undefined): DoctoralMention | null {
  if (!notes?.startsWith(JURY_PREFIX)) return null;
  const mention = notes.slice(JURY_PREFIX.length).split("|")[0];
  return mention && mention in DOCTORAL_MENTIONS ? (mention as DoctoralMention) : null;
}

/** Grau conferido, como aparece no certificado. */
export const DEGREE_TITLE = {
  licenciatura: "Licenciado",
  mestrado: "Mestre",
  doutoramento: "Doutor",
  especializacao: null,
} as const;
