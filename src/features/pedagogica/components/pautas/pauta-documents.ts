import type { SchoolSettingsRow } from "@/features/auth/use-school-settings";
import type { PedagogicalWorkspace } from "@/features/academic/server";
import {
  decidePromotionStatus,
  type PromotionOptions,
  type PromotionStatus,
  type StudentAcademicSummary,
} from "@/features/academic/assessment-engine";
import type {
  AngolaTeachingCycle,
  ClassContext,
  FinalPautaStudent,
  Gender,
  MiniPautaStudent,
  SchoolIdentity,
  StudentStatus,
  TrimesterPautaStudent,
} from "./types";

/**
 * Linhas dos quatro modelos de pauta (`PautasWorkspaceModule.tsx`) a partir do
 * resumo da turma (`buildClassAcademicSummaries`). Sem React, para se poder
 * testar e para o componente ficar só com estado e apresentação.
 */

export type WorkspaceClassGroup = PedagogicalWorkspace["classGroups"][number];

type TermGradeLike = {
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number | null;
  npp: number | null;
  npt: number | null;
};

/** PromotionStatus tem "PENDENTE" (sem notas ainda), que a Pauta impressa mostra como estado vazio. */
export function toStudentStatus(status: PromotionStatus): StudentStatus {
  return status === "PENDENTE" ? "" : status;
}

/** people.sex guarda "male"/"female" em inglês; a Pauta usa a inicial em português (M/F). */
export function toGender(sex: string | null | undefined): Gender {
  if (sex === "male") return "M";
  if (sex === "female") return "F";
  return "";
}

const shiftLabels: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};

/** Cabeçalho da escola — fonte única para os quatro modelos de pauta. */
export function buildSchoolIdentity(school: SchoolSettingsRow | null): SchoolIdentity {
  return {
    republic: "REPÚBLICA DE ANGOLA",
    province: "GOVERNO PROVINCIAL",
    municipality: "ADMINISTRAÇÃO MUNICIPAL",
    educationOffice: "DIRECÇÃO MUNICIPAL DA EDUCAÇÃO",
    schoolName: school?.name || "COMPLEXO ESCOLAR",
  };
}

/** Contexto de turma — fonte única para os quatro modelos de pauta. */
export function buildClassContext(params: {
  currentClass?: WorkspaceClassGroup | undefined;
  academicYear: string;
  cycle: AngolaTeachingCycle;
  pautaNumber: string;
  teacherName?: string | undefined;
  term?: number | undefined;
  periodCount?: number | undefined;
}): ClassContext {
  return {
    academicYear: params.academicYear,
    className: params.currentClass?.grade_name || "Classe",
    classGroup: params.currentClass?.name || "Turma",
    period: (params.currentClass?.shift && shiftLabels[params.currentClass.shift]) || "Manhã",
    pautaNumber: params.pautaNumber,
    cycle: params.cycle,
    ...(params.periodCount !== undefined ? { periodCount: params.periodCount } : {}),
    ...(params.currentClass?.course_name ? { courseName: params.currentClass.course_name } : {}),
    ...(params.teacherName ? { teacher: params.teacherName } : {}),
    ...(params.term !== undefined ? { term: params.term } : {}),
  };
}

/** Campos de identificação comuns às linhas das pautas. */
function studentIdentity(
  summary: StudentAcademicSummary,
  index: number,
  genderByEnrollmentId: ReadonlyMap<string, Gender>,
) {
  return {
    id: summary.enrollmentId,
    code: summary.registrationNumber ?? `EST-${index + 1}`,
    number: index + 1,
    name: summary.studentName,
    gender: genderByEnrollmentId.get(summary.enrollmentId) ?? "",
  };
}

/** Mini-pauta de uma disciplina: MAC/NPP/NPT gravados e MT de cada trimestre, MFD e estado. */
export function buildMiniPautaStudents({
  summaries,
  subjectId,
  termGrades,
  genderByEnrollmentId,
}: {
  summaries: ReadonlyArray<StudentAcademicSummary>;
  subjectId: string;
  termGrades: ReadonlyArray<TermGradeLike>;
  genderByEnrollmentId: ReadonlyMap<string, Gender>;
}): MiniPautaStudent[] {
  // Um mapa em vez de três `find` sobre todas as notas da turma por aluno.
  const gradeByKey = new Map<string, TermGradeLike>();
  for (const grade of termGrades) {
    if (grade.subject_id !== subjectId) continue;
    const key = `${grade.enrollment_id}:${grade.term}`;
    if (!gradeByKey.has(key)) gradeByKey.set(key, grade);
  }
  return summaries.map((summary, index) => {
    const subjSummary = summary.subjects.find((s) => s.subjectId === subjectId);
    const termCells = (term: 1 | 2 | 3, mt: number | null | undefined) => {
      const grade = gradeByKey.get(`${summary.enrollmentId}:${term}`);
      return {
        mact: grade?.mac ?? null,
        npp: grade?.npp ?? null,
        npt: grade?.npt ?? null,
        mt: mt ?? null,
      };
    };
    return {
      ...studentIdentity(summary, index, genderByEnrollmentId),
      t1: termCells(1, subjSummary?.mt1),
      t2: termCells(2, subjSummary?.mt2),
      t3: termCells(3, subjSummary?.mt3),
      mfd: subjSummary?.mfd ?? null,
      status: toStudentStatus(summary.status),
      observation: "",
    };
  });
}

/**
 * Pauta de um trimestre: MT de cada disciplina, média às décimas e estado
 * pela regra de transição do ciclo (negativas contadas pela nota de aprovação
 * do modelo).
 */
export function buildTrimesterPautaStudents({
  summaries,
  subjects,
  term,
  cycle,
  promotionOptions,
  genderByEnrollmentId,
}: {
  summaries: ReadonlyArray<StudentAcademicSummary>;
  subjects: ReadonlyArray<{ id: string }>;
  term: number;
  cycle: AngolaTeachingCycle;
  promotionOptions: PromotionOptions & { passing: number };
  genderByEnrollmentId: ReadonlyMap<string, Gender>;
}): TrimesterPautaStudent[] {
  return summaries.map((summary, index) => {
    const gradesMap: Record<string, number | null> = {};
    let total = 0;
    let count = 0;
    let failing = 0;
    for (const sub of subjects) {
      const subjSummary = summary.subjects.find((s) => s.subjectId === sub.id);
      const mt = term === 1 ? subjSummary?.mt1 : term === 2 ? subjSummary?.mt2 : subjSummary?.mt3;
      gradesMap[sub.id] = mt ?? null;
      if (mt !== null && mt !== undefined) {
        total += mt;
        count += 1;
        if (mt < promotionOptions.passing) failing += 1;
      }
    }
    const average = count > 0 ? Math.round((total / count) * 10) / 10 : null;
    const status: StudentStatus =
      average === null
        ? ""
        : toStudentStatus(
            decidePromotionStatus(average, failing, cycle, undefined, promotionOptions),
          );
    return {
      ...studentIdentity(summary, index, genderByEnrollmentId),
      subjectGrades: gradesMap,
      average,
      status,
    };
  });
}

/** Pauta final: MT1–MT3 e MFD de cada disciplina, estado anual. */
export function buildFinalPautaStudents({
  summaries,
  genderByEnrollmentId,
}: {
  summaries: ReadonlyArray<StudentAcademicSummary>;
  genderByEnrollmentId: ReadonlyMap<string, Gender>;
}): FinalPautaStudent[] {
  return summaries.map((summary, index) => ({
    ...studentIdentity(summary, index, genderByEnrollmentId),
    subjects: summary.subjects.map((s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      mt1: s.mt1,
      mt2: s.mt2,
      mt3: s.mt3,
      mfd: s.mfd,
    })),
    status: toStudentStatus(summary.status),
  }));
}

export type PautaStatusFilter = "all" | "pass" | "fail";

const PASS_STATUSES: ReadonlySet<string> = new Set<StudentStatus>([
  "TRANSITA",
  "APROVADO",
  "APTO (PAP)",
]);
const FAIL_STATUSES: ReadonlySet<string> = new Set<StudentStatus>([
  "NÃO TRANSITA",
  "REPROVADO",
  "NÃO APTO (PAP)",
  "RECURSO",
]);

/** Transita, aprovado ou apto na PAP — o que as estatísticas e o filtro "Aprovados" contam. */
export function isPassingStatus(status: string | undefined) {
  return status != null && PASS_STATUSES.has(status);
}

/** Pesquisa por nome ou código e filtro Aprovados / Não transitam. */
export function filterPautaStudents<T extends { name: string; code?: string; status?: string }>(
  list: ReadonlyArray<T>,
  searchQuery: string,
  statusFilter: PautaStatusFilter,
): T[] {
  const q = searchQuery.toLowerCase().trim();
  return list.filter((item) => {
    const matchSearch =
      !q || item.name.toLowerCase().includes(q) || Boolean(item.code?.toLowerCase().includes(q));
    if (!matchSearch) return false;
    if (statusFilter === "pass") return isPassingStatus(item.status);
    if (statusFilter === "fail") return item.status != null && FAIL_STATUSES.has(item.status);
    return true;
  });
}
