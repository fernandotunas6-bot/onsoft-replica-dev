import { annualAverage, scoreAverage, situacaoPauta } from "@/lib/angola-academic";

export type DossierGrade = {
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number;
  npp: number;
  npt: number;
};

export type DossierSubject = {
  id: string;
  name: string;
};

export function buildStudentDossier(
  grades: DossierGrade[],
  subjects: DossierSubject[],
  enrollmentId: string,
  passingGrade: number,
) {
  return subjects.map((subject) => {
    const terms = ([1, 2, 3] as const).map((term) => {
      const grade = grades.find(
        (row) =>
          row.enrollment_id === enrollmentId && row.subject_id === subject.id && row.term === term,
      );
      return grade ? scoreAverage(grade.mac, grade.npp, grade.npt) : null;
    });
    const mfa = annualAverage(terms);
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      terms,
      mfa,
      situacao:
        mfa == null
          ? { label: "Pendente", tone: "muted" as const }
          : situacaoPauta(mfa, passingGrade),
    };
  });
}

export function buildClassCourseMap(
  groups: Array<{
    id: string;
    name: string;
    grade_name?: string;
    course_name?: string;
  }>,
  enrollments: Array<{ id: string; class_group_id?: string | null }>,
  grades: Array<{ enrollment_id: string; mac: number; npp: number; npt: number }>,
  passingGrade: number,
) {
  return groups.map((group) => {
    const members = enrollments.filter((row) => row.class_group_id === group.id);
    const memberIds = new Set(members.map((row) => row.id));
    const averages = grades
      .filter((grade) => memberIds.has(grade.enrollment_id))
      .map((grade) => scoreAverage(grade.mac, grade.npp, grade.npt));
    const media = annualAverage(averages);
    const transitam = averages.filter((value) => value >= passingGrade).length;
    return {
      id: group.id,
      name: group.name,
      gradeName: group.grade_name ?? "—",
      courseName: group.course_name ?? "—",
      alunos: members.length,
      lancamentos: averages.length,
      media,
      transitam,
      pendentes: Math.max(
        0,
        members.length -
          new Set(
            grades
              .filter((grade) => memberIds.has(grade.enrollment_id))
              .map((grade) => grade.enrollment_id),
          ).size,
      ),
    };
  });
}

export function changeHistoryLines(
  scores: Array<{
    item_id: unknown;
    enrollment_id: unknown;
    score?: unknown;
    previous_score?: unknown;
    updated_at?: unknown;
  }>,
  items: Array<{ id: unknown; name: unknown }>,
  students: Array<{ id: string; student_name: string }>,
) {
  return scores
    .filter((row) => row.previous_score != null)
    .map((row) => {
      const item = items.find((entry) => String(entry.id) === String(row.item_id));
      const student = students.find((entry) => entry.id === String(row.enrollment_id));
      return {
        id: `${row.item_id}-${row.enrollment_id}-${row.updated_at}`,
        studentName: student?.student_name ?? "Aluno",
        itemName: String(item?.name ?? "Avaliação"),
        previous: Number(row.previous_score),
        current: row.score == null ? null : Number(row.score),
        updatedAt: String(row.updated_at ?? ""),
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function buildTermCloseChecklist(input: {
  total: number;
  pending: number;
  dirty: number;
  invalid: number;
  closed: boolean;
}) {
  const items = [
    {
      id: "pendentes",
      ok: input.pending === 0,
      label:
        input.pending === 0
          ? "Todas as médias estão lançadas"
          : `${input.pending} aluno(s) ainda sem média`,
    },
    {
      id: "validas",
      ok: input.invalid === 0,
      label:
        input.invalid === 0
          ? "Todas as células estão entre 0 e 20"
          : `${input.invalid} célula(s) inválida(s)`,
    },
    {
      id: "guardadas",
      ok: input.dirty === 0,
      label:
        input.dirty === 0
          ? "Não há alterações por guardar"
          : `${input.dirty} alteração(ões) por guardar`,
    },
  ];
  return {
    total: input.total,
    closed: input.closed,
    ready: items.every((item) => item.ok) && !input.closed,
    items,
  };
}

export function documentValidationCode(parts: Array<string | null | undefined>) {
  const raw = parts.filter(Boolean).join("|") || "siga";
  let hash = 2166136261;
  for (const char of raw) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `SIGA-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function rowsToTsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows
    .map((row) =>
      row
        .map((cell) =>
          String(cell ?? "")
            .replaceAll("\t", " ")
            .replaceAll("\n", " "),
        )
        .join("\t"),
    )
    .join("\n");
}

export function selectIdRange(ids: string[], fromId: string | null, toId: string) {
  if (!fromId) return [toId];
  const start = ids.indexOf(fromId);
  const end = ids.indexOf(toId);
  if (start < 0 || end < 0) return [toId];
  const [from, to] = start < end ? [start, end] : [end, start];
  return ids.slice(from, to + 1);
}

type CellValues = Record<string, Record<string, string>>;

/**
 * Valores da grelha depois de recarregar do servidor, sem perder o que o
 * professor escreveu. Uma célula conta como editada quando o valor actual
 * difere do que foi carregado da última vez; essas ficam, as outras passam a
 * ter o valor novo. Alunos que saíram da lista saem também.
 */
export function mergeReloadedValues(
  reloaded: CellValues,
  current: CellValues,
  previouslyLoaded: CellValues,
): CellValues {
  const merged: CellValues = {};
  for (const [studentId, row] of Object.entries(reloaded)) {
    const currentRow = current[studentId] ?? {};
    const loadedRow = previouslyLoaded[studentId] ?? {};
    const next: Record<string, string> = { ...row };
    for (const [key, value] of Object.entries(currentRow)) {
      if (value !== (loadedRow[key] ?? "")) next[key] = value;
    }
    merged[studentId] = next;
  }
  return merged;
}
