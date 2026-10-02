/**
 * Recuperação, exames e resultado final (puro).
 *
 * Parte da pauta anual (`grade_sheet_rows.subject_breakdown`), aplica as notas
 * dos exames e recalcula a situação com a mesma regra que `build_grade_sheet`:
 *   - faltas acima do limite da regra → não transita;
 *   - negativa numa disciplina-chave (se a regra o disser) → não transita;
 *   - média geral ≥ nota de aprovação → transita; senão, não transita.
 * A nota de aprovação, o arredondamento e as disciplinas-chave vêm da regra; o
 * acesso ao exame e o modo de cálculo vêm da época. Nada é fixado aqui.
 */
import { roundGrade, type PromotionCycleRule, type RoundingMethod } from "./assessment-model";

export const EXAM_KINDS = ["recurso", "exame_especial", "exame_final", "melhoria"] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];

export const EXAM_KIND_LABELS: Record<ExamKind, string> = {
  recurso: "Exame de recurso",
  exame_especial: "Exame especial",
  exame_final: "Exame final",
  melhoria: "Melhoria de nota",
};

export const EXAM_RESULT_METHODS = ["replace", "average", "max"] as const;
export type ExamResultMethod = (typeof EXAM_RESULT_METHODS)[number];

export const EXAM_RESULT_METHOD_LABELS: Record<ExamResultMethod, string> = {
  replace: "A nota do exame substitui a média",
  average: "Média entre a nota anterior e o exame",
  max: "Fica a maior das duas",
};

export const EXAM_SESSION_STATUSES = ["draft", "open", "closed"] as const;
export type ExamSessionStatus = (typeof EXAM_SESSION_STATUSES)[number];
export const EXAM_SESSION_STATUS_LABELS: Record<ExamSessionStatus, string> = {
  draft: "Em preparação",
  open: "Aberta",
  closed: "Fechada",
};

export const REGISTRATION_STATUSES = ["registered", "absent", "graded", "cancelled"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  registered: "Inscrito",
  absent: "Faltou",
  graded: "Com nota",
  cancelled: "Anulado",
};

export type EngineRule = {
  passingValue: number;
  maximumAbsencePercentage: number | null;
  roundingMethod: RoundingMethod;
  decimalPlaces: number;
  keySubjectsCauseFailure: boolean;
  /** Regra de transição do ciclo da turma (máx. negativas, admissão a exame). */
  promotion?: PromotionCycleRule | null;
};

export type BreakdownEntry = {
  subjectId?: string | null;
  subject?: string | null;
  average?: number | string | null;
  isKeySubject?: boolean | null;
};

export type SubjectFinal = {
  subjectId: string;
  subjectName: string;
  average: number;
  isKeySubject: boolean;
};

/**
 * A pauta anual lista uma entrada por disciplina e período: junta-as numa
 * média por disciplina (média dos períodos com nota, arredondada pela regra).
 */
export function subjectFinalsFromBreakdown(
  breakdown: BreakdownEntry[] | null | undefined,
  rule: Pick<EngineRule, "roundingMethod" | "decimalPlaces">,
): SubjectFinal[] {
  const bySubject = new Map<string, { name: string; values: number[]; key: boolean }>();
  for (const entry of breakdown ?? []) {
    const id = entry.subjectId ? String(entry.subjectId) : "";
    const value = entry.average == null || entry.average === "" ? NaN : Number(entry.average);
    if (!id || !Number.isFinite(value)) continue;
    const current = bySubject.get(id) ?? {
      name: String(entry.subject ?? "Disciplina"),
      values: [],
      key: false,
    };
    current.values.push(value);
    current.key = current.key || Boolean(entry.isKeySubject);
    bySubject.set(id, current);
  }
  return [...bySubject.entries()]
    .map(([subjectId, s]) => ({
      subjectId,
      subjectName: s.name,
      average: roundGrade(
        s.values.reduce((sum, v) => sum + v, 0) / s.values.length,
        rule.roundingMethod,
        rule.decimalPlaces,
      ),
      isKeySubject: s.key,
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, "pt"));
}

export type Eligibility =
  | { eligible: true; subjects: SubjectFinal[] }
  | {
      eligible: false;
      reason: "no-negatives" | "absences" | "too-many" | "no-grades";
      subjects: SubjectFinal[];
    };

/**
 * Quem pode ir a exame e a que disciplinas. Melhoria: qualquer disciplina já
 * aprovada. Nas outras épocas: as disciplinas em negativa, até ao máximo da
 * época; excluído por faltas não tem acesso.
 */
export function examEligibility(
  input: {
    subjects: SubjectFinal[];
    absencePercentage: number | null;
  },
  rule: EngineRule,
  session: { kind: ExamKind; maxFailedSubjects: number | null },
): Eligibility {
  if (!input.subjects.length) return { eligible: false, reason: "no-grades", subjects: [] };
  if (
    rule.maximumAbsencePercentage != null &&
    input.absencePercentage != null &&
    input.absencePercentage > rule.maximumAbsencePercentage
  ) {
    return { eligible: false, reason: "absences", subjects: [] };
  }
  if (session.kind === "melhoria") {
    const passed = input.subjects.filter((s) => s.average >= rule.passingValue);
    return passed.length
      ? { eligible: true, subjects: passed }
      : { eligible: false, reason: "no-negatives", subjects: [] };
  }
  const failed = input.subjects.filter((s) => s.average < rule.passingValue);
  if (!failed.length) return { eligible: false, reason: "no-negatives", subjects: [] };
  if (session.maxFailedSubjects != null && failed.length > session.maxFailedSubjects) {
    return { eligible: false, reason: "too-many", subjects: failed };
  }
  return { eligible: true, subjects: failed };
}

export const ELIGIBILITY_REASON_LABELS: Record<
  Extract<Eligibility, { eligible: false }>["reason"],
  string
> = {
  "no-negatives": "Sem disciplinas para exame",
  absences: "Excluído por faltas",
  "too-many": "Negativas acima do máximo da época",
  "no-grades": "Sem notas na pauta anual",
};

/**
 * Média da disciplina depois do exame, pelo método da época e o arredondamento da regra.
 * Na melhoria a nota nunca desce: um exame pior deixa a média que o aluno já tinha.
 */
export function averageAfterExam(
  original: number | null,
  score: number,
  method: ExamResultMethod,
  rule: Pick<EngineRule, "roundingMethod" | "decimalPlaces">,
  kind?: ExamKind,
) {
  const base = original ?? score;
  const raw =
    method === "replace"
      ? score
      : method === "average"
        ? (base + score) / 2
        : Math.max(base, score);
  const rounded = roundGrade(raw, rule.roundingMethod, rule.decimalPlaces);
  return kind === "melhoria" && original != null ? Math.max(original, rounded) : rounded;
}

export type FinalResultCode = "pass" | "fail" | "incomplete";

export type FinalResult = {
  result: FinalResultCode;
  average: number | null;
  failedSubjects: string[];
  reason: string | null;
};

/** Situação final com as médias efectivas (depois dos exames). */
export function computeFinalResult(
  subjects: SubjectFinal[],
  absencePercentage: number | null,
  rule: EngineRule,
): FinalResult {
  if (!subjects.length) {
    return { result: "incomplete", average: null, failedSubjects: [], reason: "Sem notas" };
  }
  const average = roundGrade(
    subjects.reduce((sum, s) => sum + s.average, 0) / subjects.length,
    rule.roundingMethod,
    rule.decimalPlaces,
  );
  const failedSubjects = subjects
    .filter((s) => s.average < rule.passingValue)
    .map((s) => s.subjectName);
  if (
    rule.maximumAbsencePercentage != null &&
    absencePercentage != null &&
    absencePercentage > rule.maximumAbsencePercentage
  ) {
    return { result: "fail", average, failedSubjects, reason: "Faltas acima do limite" };
  }
  const keyFail =
    rule.keySubjectsCauseFailure &&
    subjects.some((s) => s.isKeySubject && s.average < rule.passingValue);
  if (keyFail) {
    return { result: "fail", average, failedSubjects, reason: "Negativa em disciplina-chave" };
  }
  const promotion = rule.promotion ?? null;
  const admitted =
    promotion?.examAdmissionMinimum != null && average >= promotion.examAdmissionMinimum;
  if (average >= rule.passingValue) {
    const maxFailed = promotion?.maxFailedSubjects ?? null;
    if (maxFailed == null || failedSubjects.length <= maxFailed) {
      return { result: "pass", average, failedSubjects, reason: null };
    }
    return {
      result: "fail",
      average,
      failedSubjects,
      reason: admitted
        ? "Admitido a exame"
        : maxFailed === 0
          ? "Negativas não permitidas neste ciclo"
          : `Mais de ${maxFailed} negativa(s)`,
    };
  }
  return {
    result: "fail",
    average,
    failedSubjects,
    reason: admitted ? "Admitido a exame" : "Média abaixo da aprovação",
  };
}

/** Substitui as médias das disciplinas com exame avaliado. */
export function applyExamResults(
  subjects: SubjectFinal[],
  graded: Array<{ subjectId: string; finalAverage: number }>,
): SubjectFinal[] {
  const bySubject = new Map(graded.map((g) => [g.subjectId, g.finalAverage]));
  return subjects.map((s) =>
    bySubject.has(s.subjectId) ? { ...s, average: bySubject.get(s.subjectId)! } : s,
  );
}

/** Texto do resultado guardado no histórico académico. */
export const FINAL_OUTCOME_LABELS: Record<FinalResultCode, string> = {
  pass: "Transitou",
  fail: "Não transitou",
  incomplete: "Incompleto",
};

/**
 * Várias épocas podem avaliar a mesma disciplina (recurso e depois melhoria):
 * conta a nota da época mais recente com nota lançada.
 */
export function latestGradedBySubject(
  registrations: Array<{
    subjectId: string;
    status: string;
    finalAverage: number | null;
    sessionCreatedAt: string;
  }>,
): Array<{ subjectId: string; finalAverage: number }> {
  const latest = new Map<string, { finalAverage: number; at: string }>();
  for (const r of registrations) {
    if (r.status !== "graded" || r.finalAverage == null) continue;
    const current = latest.get(r.subjectId);
    if (!current || r.sessionCreatedAt > current.at) {
      latest.set(r.subjectId, { finalAverage: r.finalAverage, at: r.sessionCreatedAt });
    }
  }
  return [...latest.entries()].map(([subjectId, v]) => ({
    subjectId,
    finalAverage: v.finalAverage,
  }));
}

/**
 * Percentagem de faltas como a pauta a calcula: faltas ÷ aulas registadas,
 * sem contar as justificadas. `null` se não houver registos.
 */
export function absencePercentageFromStatuses(statuses: string[]): number | null {
  const counted = statuses.filter((s) => s !== "excused");
  if (!counted.length) return null;
  const absent = counted.filter((s) => s === "absent").length;
  return Math.round((absent * 10000) / counted.length) / 100;
}

/**
 * Médias que uma época encontra: as da pauta anual com as notas das épocas
 * anteriores já aplicadas. Sem isto, uma segunda época partia outra vez da
 * pauta — quem passou no recurso voltava a ser inscrito no exame especial com
 * a negativa antiga e, com «substitui», uma nota pior apagava o recurso; e a
 * melhoria não via as disciplinas recuperadas no recurso.
 */
export function subjectsBeforeSession(
  subjects: SubjectFinal[],
  registrations: Array<{
    sessionId: string;
    subjectId: string;
    status: string;
    finalAverage: number | null;
    sessionCreatedAt: string;
  }>,
  session: { id: string; createdAt: string },
): SubjectFinal[] {
  const earlier = registrations.filter(
    (r) =>
      r.sessionId !== session.id &&
      (r.sessionCreatedAt < session.createdAt ||
        (r.sessionCreatedAt === session.createdAt && r.sessionId < session.id)),
  );
  return applyExamResults(subjects, latestGradedBySubject(earlier));
}
