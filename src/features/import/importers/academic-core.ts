import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalEntityKey } from "../engine/dedupe";
import { normalizeDate, normalizeText } from "../engine/normalize";

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
  const matches = rows.filter((row) => selectors.some((selector) => normalizedKey(selector(row)) === key));
  return { row: matches.length === 1 ? matches[0]! : null, ambiguous: matches.length > 1 };
}

export async function loadStudentRefs(db: SupabaseClient, schoolId: string): Promise<StudentRef[]> {
  const { data: students, error: studentError } = await db
    .from("students")
    .select("id, person_id, student_number, status")
    .eq("school_id", schoolId);
  if (studentError) throw new Error(`Não foi possível carregar alunos: ${studentError.message}`);

  const personIds = [...new Set((students ?? []).map((row) => String(row.person_id)).filter(Boolean))];
  const { data: people, error: peopleError } = personIds.length
    ? await db
        .from("people")
        .select("id, national_id")
        .eq("school_id", schoolId)
        .in("id", personIds)
    : { data: [], error: null };
  if (peopleError) throw new Error(`Não foi possível carregar identificadores dos alunos: ${peopleError.message}`);
  const nationalIdByPerson = new Map(
    (people ?? []).map((row) => [String(row.id), row.national_id ? String(row.national_id) : null]),
  );
  return (students ?? []).map((row) => ({
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

export function resolveSubject(value: unknown, subjects: SubjectRef[]) {
  return uniqueExactMatch(value, subjects, [(subject) => subject.code, (subject) => subject.name]);
}

export function parseTerm(value: unknown): 1 | 2 | 3 | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (/^(1|1º|1°|1o)(\b|\s|$)/.test(text) || text.includes("primeiro")) return 1;
  if (/^(2|2º|2°|2o)(\b|\s|$)/.test(text) || text.includes("segundo")) return 2;
  if (/^(3|3º|3°|3o)(\b|\s|$)/.test(text) || text.includes("terceiro")) return 3;
  const numeric = Number(text.replace(/[^0-9]/g, ""));
  return numeric === 1 || numeric === 2 || numeric === 3 ? numeric : null;
}

export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || normalizeText(value) === "") return null;
  const number = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 20 ? number : null;
}

export function normalizedEnrollmentDate(value: unknown) {
  return normalizeDate(value) ?? new Date().toISOString().slice(0, 10);
}

export function normalizeShift(value: unknown): "morning" | "afternoon" | "evening" | null {
  const key = normalizedKey(value);
  if (["morning", "manha", "matutino", "matutina"].includes(key)) return "morning";
  if (["afternoon", "tarde", "vespertino", "vespertina"].includes(key)) return "afternoon";
  if (["evening", "noite", "noturno", "noturna"].includes(key)) return "evening";
  return null;
}
