import {
  angolaGradeScale,
  calculateDisciplineFinalAverage,
  normalizeScore,
} from "@/lib/angola-academic";

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

/** Uma linha por aluno; colunas = disciplinas; período = trimestre ou média anual (MFD). */
export function buildPautaExportRows(
  grades: ReadonlyArray<PautaGradeInput>,
  subjectIds: ReadonlyArray<string>,
  period: number | "anual",
): PautaExportRow[] {
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
            ? calculateDisciplineFinalAverage(t[0], t[1], t[2])
            : (t[period - 1] ?? null);
      }
      const values = Object.values(scores).filter((v): v is number => v != null);
      const average = values.length
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length + Number.EPSILON) * 10) / 10
        : null;
      const situation =
        average == null ? "—" : average >= angolaGradeScale.passing ? "Transita" : "Não transita";
      return {
        number: index + 1,
        enrollment_id: enrollmentId,
        student_name: entry.name,
        registration_number: entry.reg,
        scores,
        average,
        situation,
      };
    });
  return rows;
}
