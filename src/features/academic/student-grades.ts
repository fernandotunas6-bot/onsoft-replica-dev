/**
 * Boletim do aluno (e do educando, para o encarregado): notas MAC/NPP/NPT por
 * trimestre, médias e perspectiva de aprovação, em todos os anos lectivos em
 * que teve matrícula. Leitura apenas; o lançamento continua nos diários.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import {
  buildSubjectYearReport,
  buildTermGrade,
  overallAverage,
  type SubjectYearReport,
  type TermGrade,
} from "./student-grade-report";

export type StudentYearReport = {
  academicYearId: string;
  name: string;
  className: string | null;
  isCurrent: boolean;
  termCount: number;
  average: number | null;
  subjects: SubjectYearReport[];
  /** Resultado registado no histórico académico (pauta anual + exames). */
  officialResult: { outcome: string; finalAverage: number | null } | null;
};

export type StudentGradeReport = { years: StudentYearReport[] };

/** Diários fechados/homologados: a nota deixa de ser provisória. */
const FINAL_GRADEBOOK_STATUSES = new Set(["closed", "homologated", "published", "locked"]);

const inputSchema = z.object({ studentId: z.string().uuid().optional() });

type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));
const uniq = (values: unknown[]) => [...new Set(values.map(str).filter(Boolean))];

export const getMyStudentGrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<StudentGradeReport> => {
    const visible = await resolveVisibleStudent(context.userId, data.studentId);
    if (!visible) return { years: [] };
    const { db, schoolId, studentId } = visible;

    const { data: enrollmentRows } = await db
      .from("enrollments")
      .select("id, academic_year_id, class_group_id, status, created_at")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    const enrollments = (enrollmentRows ?? []) as Row[];
    if (!enrollments.length) return { years: [] };

    const yearIds = uniq(enrollments.map((e) => e["academic_year_id"]));
    const classGroupIds = uniq(enrollments.map((e) => e["class_group_id"]));
    const enrollmentIds = uniq(enrollments.map((e) => e["id"]));

    const [yearsRes, groupsRes, termsRes, classSubjectsRes, gradebooksRes] = await Promise.all([
      yearIds.length
        ? db
            .from("academic_years")
            .select("id, name, status, starts_on")
            .eq("school_id", schoolId)
            .in("id", yearIds)
        : Promise.resolve({ data: [] as Row[] }),
      classGroupIds.length
        ? db
            .from("class_groups")
            .select("id, name")
            .eq("school_id", schoolId)
            .in("id", classGroupIds)
        : Promise.resolve({ data: [] as Row[] }),
      yearIds.length
        ? db
            .from("terms")
            .select("id, sequence, academic_year_id")
            .eq("school_id", schoolId)
            .in("academic_year_id", yearIds)
        : Promise.resolve({ data: [] as Row[] }),
      classGroupIds.length
        ? db
            .from("class_subjects")
            .select("id, class_group_id, subject_id")
            .eq("school_id", schoolId)
            .in("class_group_id", classGroupIds)
        : Promise.resolve({ data: [] as Row[] }),
      classGroupIds.length
        ? db
            .from("gradebooks")
            .select("id, term_id, class_subject_id, class_group_id, status, rule_set_id")
            .eq("school_id", schoolId)
            .in("class_group_id", classGroupIds)
        : Promise.resolve({ data: [] as Row[] }),
    ]);

    const gradebooks = (gradebooksRes.data ?? []) as Row[];
    const classSubjects = (classSubjectsRes.data ?? []) as Row[];
    const gradebookIds = uniq(gradebooks.map((g) => g["id"]));
    const ruleSetIds = uniq(gradebooks.map((g) => g["rule_set_id"]));

    const [itemsRes, subjectsRes, rulesRes] = await Promise.all([
      gradebookIds.length
        ? db.from("grade_items").select("id, code, gradebook_id").in("gradebook_id", gradebookIds)
        : Promise.resolve({ data: [] as Row[] }),
      classSubjects.length
        ? db
            .from("subjects")
            .select("id, name")
            .eq("school_id", schoolId)
            .in("id", uniq(classSubjects.map((c) => c["subject_id"])))
        : Promise.resolve({ data: [] as Row[] }),
      ruleSetIds.length
        ? db.from("assessment_rule_sets").select("id, passing_value").in("id", ruleSetIds)
        : Promise.resolve({ data: [] as Row[] }),
    ]);
    const items = (itemsRes.data ?? []) as Row[];
    const itemIds = uniq(items.map((i) => i["id"]));
    const { data: scoreRows } =
      itemIds.length && enrollmentIds.length
        ? await db
            .from("grade_scores")
            .select("grade_item_id, enrollment_id, score, status")
            .eq("school_id", schoolId)
            .in("enrollment_id", enrollmentIds)
            .in("grade_item_id", itemIds)
        : { data: [] as Row[] };

    const byId = (rows: Row[]) => new Map(rows.map((row) => [str(row["id"]), row]));
    const years = byId((yearsRes.data ?? []) as Row[]);
    const groups = byId((groupsRes.data ?? []) as Row[]);
    const terms = byId((termsRes.data ?? []) as Row[]);
    const subjects = byId((subjectsRes.data ?? []) as Row[]);
    const classSubjectById = byId(classSubjects);
    const gradebookById = byId(gradebooks);
    const itemById = byId(items);
    const passingByRule = new Map(
      ((rulesRes.data ?? []) as Row[]).map((r) => [str(r["id"]), Number(r["passing_value"])]),
    );
    const termCountByYear = new Map<string, number>();
    for (const term of terms.values()) {
      const year = str(term["academic_year_id"]);
      termCountByYear.set(year, Math.max(termCountByYear.get(year) ?? 0, Number(term["sequence"])));
    }

    // enrollment → (subject → term → {mac,npp,npt}) ; o diário diz o trimestre e a disciplina.
    type Acc = {
      mac?: number | null;
      npp?: number | null;
      npt?: number | null;
      provisional: boolean;
    };
    const grades = new Map<string, Map<string, Map<number, Acc>>>();
    const passingBySubject = new Map<string, number>();
    for (const score of (scoreRows ?? []) as Row[]) {
      const item = itemById.get(str(score["grade_item_id"]));
      const gradebook = item ? gradebookById.get(str(item["gradebook_id"])) : undefined;
      const classSubject = gradebook
        ? classSubjectById.get(str(gradebook["class_subject_id"]))
        : undefined;
      const term = gradebook ? terms.get(str(gradebook["term_id"])) : undefined;
      if (!item || !gradebook || !classSubject || !term) continue;
      const enrollmentId = str(score["enrollment_id"]);
      const subjectId = str(classSubject["subject_id"]);
      const termNumber = Number(term["sequence"]);
      const perSubject = grades.get(enrollmentId) ?? new Map<string, Map<number, Acc>>();
      const perTerm = perSubject.get(subjectId) ?? new Map<number, Acc>();
      const acc = perTerm.get(termNumber) ?? {
        provisional: !FINAL_GRADEBOOK_STATUSES.has(str(gradebook["status"])),
      };
      const value = score["score"] == null ? null : Number(score["score"]);
      const code = str(item["code"]).toUpperCase();
      if (code === "MAC") acc.mac = value;
      if (code === "NPP") acc.npp = value;
      if (code === "NPT") acc.npt = value;
      perTerm.set(termNumber, acc);
      perSubject.set(subjectId, perTerm);
      grades.set(enrollmentId, perSubject);
      const passing = passingByRule.get(str(gradebook["rule_set_id"]));
      if (passing != null && Number.isFinite(passing)) passingBySubject.set(subjectId, passing);
    }

    // Resultado oficial do ano (registado pela secretaria no histórico).
    const { data: historyRows } = await db
      .from("student_academic_history")
      .select("academic_year_label, outcome, final_average, updated_at")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false });
    const officialByYearLabel = new Map<string, { outcome: string; finalAverage: number | null }>();
    for (const row of (historyRows ?? []) as Row[]) {
      const label = str(row["academic_year_label"]);
      if (!label || officialByYearLabel.has(label) || !row["outcome"]) continue;
      officialByYearLabel.set(label, {
        outcome: str(row["outcome"]),
        finalAverage: row["final_average"] == null ? null : Number(row["final_average"]),
      });
    }

    const report: StudentYearReport[] = enrollments.map((enrollment) => {
      const yearId = str(enrollment["academic_year_id"]);
      const classGroupId = str(enrollment["class_group_id"]);
      const year = years.get(yearId);
      const termCount = termCountByYear.get(yearId) || 3;
      const perSubject = grades.get(str(enrollment["id"])) ?? new Map();
      const subjectIds = uniq([
        ...classSubjects
          .filter((cs) => str(cs["class_group_id"]) === classGroupId)
          .map((cs) => cs["subject_id"]),
        ...perSubject.keys(),
      ]);
      const subjectReports = subjectIds
        .map((subjectId) => {
          const perTerm = perSubject.get(subjectId) ?? new Map<number, Acc>();
          const termGrades: Array<TermGrade | null> = Array.from({ length: termCount }, (_, i) => {
            const acc = perTerm.get(i + 1);
            return acc ? buildTermGrade(acc) : null;
          });
          return buildSubjectYearReport({
            subjectId,
            subjectName: str(subjects.get(subjectId)?.["name"]) || "Disciplina",
            terms: termGrades,
            termCount,
            passing: passingBySubject.get(subjectId) ?? null,
          });
        })
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName, "pt"));
      return {
        academicYearId: yearId,
        name: str(year?.["name"]) || "Ano lectivo",
        className: str(groups.get(classGroupId)?.["name"]) || null,
        isCurrent: str(enrollment["status"]) === "active" && str(year?.["status"]) === "active",
        termCount,
        average: overallAverage(subjectReports),
        subjects: subjectReports,
        officialResult: officialByYearLabel.get(str(year?.["name"])) ?? null,
      };
    });
    return { years: report };
  });
