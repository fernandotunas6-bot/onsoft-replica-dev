import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalEntityKey } from "../engine/dedupe";
import { normalizeDate, normalizeText } from "../engine/normalize";
import { schoolTodayIso } from "@/lib/school-date";
import { selectAllPages } from "../engine/paged";
import {
  normalizeGrade as catalogGrade,
  normalizePeriod,
  subjectCatalogKey,
} from "@/features/education-catalog/normalize";

export type StudentRef = {
  id: string;
  person_id: string;
  student_number: string;
  national_id: string | null;
  status: string;
};

export type ClassGroupRef = {
  id: string;
  code: string;
  name: string;
  academic_year_id: string;
  grade_level_id?: string | null;
};

export type SubjectRef = { id: string; code: string; name: string };
export type AcademicLevelRef = { id: string; code: string; name: string };
export type AcademicYearRef = { id: string; name: string; starts_on: string; ends_on: string };
export type TeacherRef = { id: string; employee_number: string; national_id: string | null };
export type ClassSubjectRef = {
  id: string;
  class_group_id: string;
  subject_id: string;
  teacher_id: string | null;
};

export function normalizedKey(value: unknown) {
  return canonicalEntityKey(normalizeText(value));
}

export function uniqueExactMatch<T>(
  value: unknown,
  rows: T[],
  selectors: Array<(row: T) => unknown>,
): { row: T | null; ambiguous: boolean } {
  const key = normalizedKey(value);
  if (!key) return { row: null, ambiguous: false };
  const matches = rows.filter((row) =>
    selectors.some((selector) => normalizedKey(selector(row)) === key),
  );
  return { row: matches.length === 1 ? matches[0]! : null, ambiguous: matches.length > 1 };
}

export async function loadStudentRefs(db: SupabaseClient, schoolId: string): Promise<StudentRef[]> {
  // Em páginas e sem filtrar por uma lista com todos os ids: o PostgREST corta em 1000
  // linhas e uma lista com centenas de ids passa o tamanho máximo do URL.
  type StudentRow = { id: string; person_id: string; student_number: string; status: string };
  type PersonRow = { id: string; national_id: string | null };
  const [students, people] = await Promise.all([
    selectAllPages<StudentRow>(
      (from, to) =>
        db
          .from("students")
          .select("id, person_id, student_number, status")
          .eq("school_id", schoolId)
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: StudentRow[] | null;
          error: { message: string } | null;
        }>,
      "Não foi possível carregar alunos",
    ),
    selectAllPages<PersonRow>(
      (from, to) =>
        db
          .from("people")
          .select("id, national_id")
          .eq("school_id", schoolId)
          .not("national_id", "is", null)
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: PersonRow[] | null;
          error: { message: string } | null;
        }>,
      "Não foi possível carregar identificadores dos alunos",
    ),
  ]);
  const nationalIdByPerson = new Map(
    people.map((row) => [String(row.id), row.national_id ? String(row.national_id) : null]),
  );
  return students.map((row) => ({
    id: String(row.id),
    person_id: String(row.person_id),
    student_number: String(row.student_number ?? ""),
    national_id: nationalIdByPerson.get(String(row.person_id)) ?? null,
    status: String(row.status ?? "active"),
  }));
}

export async function loadClassGroupRefs(
  db: SupabaseClient,
  schoolId: string,
  academicYearId: string | null,
): Promise<ClassGroupRef[]> {
  let query = db
    .from("class_groups")
    .select("id, code, name, academic_year_id, grade_level_id")
    .eq("school_id", schoolId);
  if (academicYearId) query = query.eq("academic_year_id", academicYearId);
  const { data, error } = await query;
  if (error) throw new Error(`Não foi possível carregar turmas: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    academic_year_id: String(row.academic_year_id ?? ""),
    grade_level_id: row.grade_level_id ? String(row.grade_level_id) : null,
  }));
}

export async function loadSubjectRefs(db: SupabaseClient, schoolId: string): Promise<SubjectRef[]> {
  const { data, error } = await db
    .from("subjects")
    .select("id, code, name")
    .eq("school_id", schoolId)
    .neq("status", "inactive");
  if (error) throw new Error(`Não foi possível carregar disciplinas: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
  }));
}

export async function loadAcademicLevelRefs(
  db: SupabaseClient,
  schoolId: string,
): Promise<AcademicLevelRef[]> {
  const { data, error } = await db
    .from("academic_levels")
    .select("id, code, name")
    .eq("school_id", schoolId)
    .eq("is_active", true);
  if (error) throw new Error(`Não foi possível carregar níveis académicos: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
  }));
}

export async function loadAcademicYearRefs(
  db: SupabaseClient,
  schoolId: string,
): Promise<AcademicYearRef[]> {
  const { data, error } = await db
    .from("academic_years")
    .select("id, name, starts_on, ends_on")
    .eq("school_id", schoolId);
  if (error) throw new Error(`Não foi possível carregar anos lectivos: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    starts_on: String(row.starts_on ?? ""),
    ends_on: String(row.ends_on ?? ""),
  }));
}

export async function loadTeacherRefs(db: SupabaseClient, schoolId: string): Promise<TeacherRef[]> {
  const { data: teachers, error } = await db
    .from("teachers")
    .select("id, person_id, employee_number")
    .eq("school_id", schoolId);
  if (error) throw new Error(`Não foi possível carregar professores: ${error.message}`);
  const personIds = [
    ...new Set((teachers ?? []).map((row) => String(row.person_id)).filter(Boolean)),
  ];
  const { data: people, error: peopleError } = personIds.length
    ? await db
        .from("people")
        .select("id, national_id")
        .eq("school_id", schoolId)
        .in("id", personIds)
    : { data: [], error: null };
  if (peopleError)
    throw new Error(
      `Não foi possível carregar identificadores dos professores: ${peopleError.message}`,
    );
  const nationalIdByPerson = new Map(
    (people ?? []).map((row) => [String(row.id), row.national_id ? String(row.national_id) : null]),
  );
  return (teachers ?? []).map((row) => ({
    id: String(row.id),
    employee_number: String(row.employee_number ?? ""),
    national_id: nationalIdByPerson.get(String(row.person_id)) ?? null,
  }));
}

export async function loadClassSubjectRefs(
  db: SupabaseClient,
  schoolId: string,
): Promise<ClassSubjectRef[]> {
  const { data, error } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id")
    .eq("school_id", schoolId)
    .eq("status", "active");
  if (error)
    throw new Error(`Não foi possível carregar disciplinas atribuídas à turma: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    class_group_id: String(row.class_group_id),
    subject_id: String(row.subject_id),
    teacher_id: row.teacher_id ? String(row.teacher_id) : null,
  }));
}

export function studentIdentifierOf(row: Record<string, unknown>) {
  return normalizeText(
    row["student_identifier"] ?? row["aluno"] ?? row["processo"] ?? row["bi"] ?? row["BI"],
  );
}

export function resolveStudent(identifier: unknown, students: StudentRef[]) {
  return uniqueExactMatch(identifier, students, [
    (student) => student.student_number,
    (student) => student.national_id,
  ]);
}

export function resolveClassGroup(value: unknown, groups: ClassGroupRef[]) {
  return uniqueExactMatch(value, groups, [(group) => group.code, (group) => group.name]);
}

/**
 * Disciplina da folha → disciplina da escola. Primeiro código ou nome exactos;
 * se nada bater, a equivalência do catálogo («L. Portuguesa» → «Língua
 * Portuguesa», «Inglês» → «Língua Estrangeira (Inglês)»), só por nome e só
 * quando aponta para uma única disciplina da escola. `viaCatalog` permite ao
 * importador avisar da associação.
 */
export function resolveSubject(
  value: unknown,
  subjects: SubjectRef[],
): { row: SubjectRef | null; ambiguous: boolean; viaCatalog?: true } {
  const exact = uniqueExactMatch(value, subjects, [
    (subject) => subject.code,
    (subject) => subject.name,
  ]);
  if (exact.row || exact.ambiguous) return exact;
  const key = subjectCatalogKey(value);
  if (!key) return exact;
  const matches = subjects.filter((subject) => subjectCatalogKey(subject.name) === key);
  if (matches.length === 1) return { row: matches[0]!, ambiguous: false, viaCatalog: true };
  return { row: null, ambiguous: matches.length > 1 };
}

export function parseTerm(value: unknown): 1 | 2 | 3 | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (/^(1|1º|1°|1o)(\b|\s|$)/.test(text) || text.includes("primeiro")) return 1;
  if (/^(2|2º|2°|2o)(\b|\s|$)/.test(text) || text.includes("segundo")) return 2;
  if (/^(3|3º|3°|3o)(\b|\s|$)/.test(text) || text.includes("terceiro")) return 3;
  const numeric = Number(text.replace(/[^0-9]/g, ""));
  if (numeric === 1 || numeric === 2 || numeric === 3) return numeric;
  // «I Trimestre», «III trimestre», «Segunda trimestre», «T2»: as mesmas regras
  // do catálogo. Só com a palavra do período (ou T/S), nunca um número solto.
  const period = normalizePeriod(text);
  return period && period.n <= 3 ? (period.n as 1 | 2 | 3) : null;
}

type GradeLevelRef = { code: string; name: string };

/**
 * Classe da folha → classe da escola. Primeiro código ou nome exactos; se nada
 * bater, a mesma classe escrita de outra forma («10a classe», «décima classe»,
 * «10.ª Classe» → «10ª Classe»), pelo número e pela unidade (classe/ano), e só
 * quando aponta para uma única classe da escola. `viaCatalog` permite avisar.
 */
export function resolveGradeLevel<T extends GradeLevelRef>(
  value: unknown,
  grades: T[],
): { row: T | null; ambiguous: boolean; viaCatalog?: true } {
  const exact = uniqueExactMatch(value, grades, [(g) => g.code, (g) => g.name]);
  if (exact.row || exact.ambiguous) return exact;
  const wanted = catalogGrade(normalizeText(value));
  if (!wanted) return exact;
  const matches = grades.filter((g) => {
    const own = catalogGrade(g.name) ?? catalogGrade(g.code);
    return own?.n === wanted.n && own.unit === wanted.unit;
  });
  if (matches.length === 1) return { row: matches[0]!, ambiguous: false, viaCatalog: true };
  return { row: null, ambiguous: matches.length > 1 };
}

export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || normalizeText(value) === "") return null;
  const number = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 20 ? number : null;
}

export function normalizedEnrollmentDate(value: unknown) {
  return normalizeDate(value) ?? schoolTodayIso();
}

export function normalizeShift(value: unknown): "morning" | "afternoon" | "evening" | null {
  const key = normalizedKey(value);
  if (["morning", "manha", "matutino", "matutina"].includes(key)) return "morning";
  if (["afternoon", "tarde", "vespertino", "vespertina"].includes(key)) return "afternoon";
  if (["evening", "noite", "noturno", "noturna"].includes(key)) return "evening";
  return null;
}
