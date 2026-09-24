import { parseCivilDate, parseLocalMinute } from "./academicTime";
export type AssessmentKind =
  "diagnostic" | "continuous" | "trimester_test" | "national_exam" |
  "resit" | "extraordinary" | "equivalence" | "grade_improvement";
export type AssessmentWindow = {
  id: string; periodId: string; kind: AssessmentKind; startsOn: string; endsOn: string;
  allowedGrades?: readonly number[];
};
export type AssessmentSession = {
  id: string; windowId: string; date: string; startsAt: string; endsAt: string;
  classGroupId: string; subjectId: string; roomId?: string; invigilatorIds: readonly string[];
  grade: number;
};
export type AssessmentIssue = { code: string; ids: string[]; message: string };
export function validateAssessmentCalendar(input: {
  periods: readonly { id: string; startsOn: string; endsOn: string }[];
  windows: readonly AssessmentWindow[]; sessions: readonly AssessmentSession[];
  blockedDates?: readonly string[];
  maximumExamsPerClassPerDay?: number;
}): AssessmentIssue[] {
  const issues: AssessmentIssue[] = [];
  const max = input.maximumExamsPerClassPerDay ?? 2;
  if (!Number.isSafeInteger(max) || max < 1 || max > 6) throw new Error("Limite diário inválido.");
  const periods = new Map(input.periods.map((p) => [p.id, p]));
  const windows = new Map(input.windows.map((w) => [w.id, w]));
  if (periods.size !== input.periods.length || windows.size !== input.windows.length ||
      new Set(input.sessions.map((s) => s.id)).size !== input.sessions.length) {
    throw new Error("Identificadores de calendário repetidos.");
  }
  const blocked = new Set(input.blockedDates ?? []);
  for (const date of blocked) parseCivilDate(date);
  for (const period of input.periods) {
    if (parseCivilDate(period.startsOn) > parseCivilDate(period.endsOn)) throw new Error("Período inválido.");
  }
  for (const window of input.windows) {
    const period = periods.get(window.periodId);
    if (!period || parseCivilDate(window.startsOn) > parseCivilDate(window.endsOn)) {
      throw new Error("Janela de avaliação inválida.");
    }
    if (window.startsOn < period.startsOn || window.endsOn > period.endsOn) {
      issues.push({ code: "outside_period", ids: [window.id], message: "Janela fora do período lectivo." });
    }
    if (window.allowedGrades?.some((g) => !Number.isInteger(g) || g < 1 || g > 12)) {
      throw new Error("Classes permitidas inválidas.");
    }
    if (window.kind === "national_exam" && window.allowedGrades?.some((g) => ![6, 9, 12].includes(g))) {
      issues.push({ code: "national_exam_grade", ids: [window.id], message: "Classe não elegível para exame nacional do ensino geral." });
    }
  }
  const byClassDay = new Map<string, AssessmentSession[]>();
  for (const session of input.sessions) {
    const window = windows.get(session.windowId);
    parseCivilDate(session.date);
    const start = parseLocalMinute(session.startsAt), end = parseLocalMinute(session.endsAt);
    if (end <= start || !session.classGroupId || !session.subjectId ||
        !Number.isInteger(session.grade) || session.grade < 1 || session.grade > 12 ||
        new Set(session.invigilatorIds).size !== session.invigilatorIds.length) {
      throw new Error("Sessão de avaliação inválida.");
    }
    if (!window || session.date < window.startsOn || session.date > window.endsOn ||
        blocked.has(session.date) ||
        (window.allowedGrades && !window.allowedGrades.includes(session.grade))) {
      issues.push({ code: "invalid_session_date", ids: [session.id], message: "Sessão fora da janela, em data bloqueada ou classe não elegível." });
    }
    const key = session.classGroupId + "@" + session.date;
    byClassDay.set(key, [...(byClassDay.get(key) ?? []), session]);
  }
  for (const sessions of byClassDay.values()) {
    if (sessions.length > max) issues.push({ code: "daily_exam_limit",
      ids: sessions.map((s) => s.id), message: "Carga de provas por turma excede o limite diário." });
  }
  for (let i = 0; i < input.sessions.length; i++) {
    const a = input.sessions[i];
    for (let j = i + 1; j < input.sessions.length; j++) {
      const b = input.sessions[j];
      if (a.date !== b.date ||
          parseLocalMinute(a.startsAt) >= parseLocalMinute(b.endsAt) ||
          parseLocalMinute(b.startsAt) >= parseLocalMinute(a.endsAt)) continue;
      if (a.classGroupId === b.classGroupId ||
          (a.roomId && b.roomId && a.roomId === b.roomId) ||
          a.invigilatorIds.some((id) => b.invigilatorIds.includes(id))) {
        issues.push({ code: "assessment_collision", ids: [a.id, b.id],
          message: "Sobreposição de turma, sala ou vigilante." });
      }
    }
  }
  return issues;
}
