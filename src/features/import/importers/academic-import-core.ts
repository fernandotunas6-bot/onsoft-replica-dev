import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalEntityKey, findBestEntityMatch } from "../engine/dedupe";
import { normalizeText } from "../engine/normalize";
import type {
  EnrollmentImportRef,
  ImportRefCache,
  StudentImportRef,
  SubjectImportRef,
} from "../engine/types";
import { loadExistingPeople } from "./people-core";

export async function loadAcademicImportCache(
  db: SupabaseClient,
  schoolId: string,
  academicYearId: string | null,
): Promise<ImportRefCache> {
  let groupsQuery = db.from("class_groups").select("id, name").eq("school_id", schoolId);
  if (academicYearId) groupsQuery = groupsQuery.eq("academic_year_id", academicYearId);

  let enrollmentsQuery = db
    .from("enrollments")
    .select("id, student_id, class_group_id, academic_year_id, status")
    .eq("school_id", schoolId)
    .in("status", ["pending", "active"]);
  if (academicYearId) enrollmentsQuery = enrollmentsQuery.eq("academic_year_id", academicYearId);

  const [existingPeople, groups, studentsResult, enrollmentsResult, subjectsResult] =
    await Promise.all([
      loadExistingPeople(db, schoolId),
      groupsQuery,
      db.from("students").select("id, student_number, person_id").eq("school_id", schoolId),
      enrollmentsQuery,
      db
        .from("subjects")
        .select("id, name, code")
        .eq("school_id", schoolId)
        .neq("status", "inactive"),
    ]);

  if (groups.error) throw new Error(`Não foi possível carregar turmas: ${groups.error.message}`);
  if (studentsResult.error)
    throw new Error(`Não foi possível carregar alunos: ${studentsResult.error.message}`);
  if (enrollmentsResult.error)
    throw new Error(`Não foi possível carregar matrículas: ${enrollmentsResult.error.message}`);
  if (subjectsResult.error)
    throw new Error(`Não foi possível carregar disciplinas: ${subjectsResult.error.message}`);

  const peopleById = new Map(existingPeople.map((person) => [person.id, person]));
  const students: StudentImportRef[] = (studentsResult.data ?? []).map((student) => ({
    id: String(student.id),
    student_number: String(student.student_number ?? ""),
    person_id: String(student.person_id),
    national_id: peopleById.get(String(student.person_id))?.national_id ?? null,
  }));
  const studentByPersonId = new Map(
    students.map((student) => [
      student.person_id,
      { id: student.id, student_number: student.student_number },
    ]),
  );

  return {
    existingPeople,
    classGroups: (groups.data ?? []).map((group) => ({
      id: String(group.id),
      name: String(group.name),
    })),
    studentByPersonId,
    students,
    enrollments: (enrollmentsResult.data ?? []) as EnrollmentImportRef[],
    subjects: (subjectsResult.data ?? []) as SubjectImportRef[],
  };
}

export function studentIdentifierOf(normalized: Record<string, unknown>): string {
  return normalizeText(
    normalized["student_identifier"] ??
      normalized["aluno"] ??
      normalized["processo"] ??
      normalized["bi"] ??
      normalized["Aluno (Processo ou BI)"] ??
      normalized["Aluno (BI ou Processo)"],
  );
}

export function findStudentByIdentifier(identifier: string, cache: ImportRefCache) {
  const wanted = canonicalEntityKey(identifier);
  if (!wanted) return null;
  return (
    cache.students?.find(
      (student) =>
        canonicalEntityKey(student.student_number) === wanted ||
        canonicalEntityKey(student.national_id ?? "") === wanted,
    ) ?? null
  );
}

export function classGroupNameOf(normalized: Record<string, unknown>): string {
  return normalizeText(normalized["class_group"] ?? normalized["turma"] ?? normalized["Turma"]);
}

export function findClassGroup(name: string, cache: ImportRefCache) {
  if (!name) return null;
  return findBestEntityMatch(name, cache.classGroups, (group) => group.name);
}

export function subjectNameOf(normalized: Record<string, unknown>): string {
  return normalizeText(normalized["subject"] ?? normalized["disciplina"] ?? normalized["Disciplina"]);
}

export function findSubject(nameOrCode: string, cache: ImportRefCache) {
  if (!nameOrCode) return null;
  const wanted = canonicalEntityKey(nameOrCode);
  const exactCode = cache.subjects?.find(
    (subject) => canonicalEntityKey(subject.code ?? "") === wanted,
  );
  if (exactCode) return exactCode;
  const match = findBestEntityMatch(nameOrCode, cache.subjects ?? [], (subject) => subject.name);
  return match ?? null;
}

export function parseTerm(value: unknown): 1 | 2 | 3 | null {
  const text = normalizeText(value).toLowerCase();
  const digit = text.match(/[123]/)?.[0];
  if (digit === "1" || /primeir/.test(text)) return 1;
  if (digit === "2" || /segund/.test(text)) return 2;
  if (digit === "3" || /terceir/.test(text)) return 3;
  return null;
}

export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const score = Number(String(value).replace(",", "."));
  return Number.isFinite(score) && score >= 0 && score <= 20 ? score : null;
}
