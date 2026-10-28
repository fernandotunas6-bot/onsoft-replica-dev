import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, requireSgaWriterFor } from "@/integrations/supabase/sga-admin";
import { readAllPages, readInChunks } from "@/integrations/supabase/read-all-pages";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { schoolTodayIso } from "@/lib/school-date";
import { studentBalances } from "./student-ledger";

function checked<T>(result: { data: T[]; error: { message: string } | null }): T[] {
  if (result.error)
    throw publicDatabaseError(result.error, "Não foi possível carregar a lista financeira.");
  // readAllPages tem um tecto; nunca apresentar totais silenciosamente incompletos.
  if (result.data.length >= 100_000)
    throw new Error("Volume demasiado grande. Peça um relatório à administração.");
  return result.data;
}

/** Lista por aluno/ano, incluindo quem ainda não tem contrato ou factura. */
export const listStudentLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ academicYearId: z.string().guid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const [enrollments, groups, grades, programs, levels] = await Promise.all([
      readAllPages((from, to) =>
        db
          .from("enrollments")
          .select("id, student_id, class_group_id, status, enrolled_on")
          .eq("school_id", schoolId)
          .eq("academic_year_id", data.academicYearId)
          .order("id")
          .range(from, to),
      ).then(checked),
      readAllPages((from, to) =>
        db
          .from("class_groups")
          .select("id, name, grade_level_id")
          .eq("school_id", schoolId)
          .eq("academic_year_id", data.academicYearId)
          .order("id")
          .range(from, to),
      ).then(checked),
      readAllPages((from, to) =>
        db
          .from("grade_levels")
          .select("id, name, program_id")
          .eq("school_id", schoolId)
          .order("id")
          .range(from, to),
      ).then(checked),
      readAllPages((from, to) =>
        db
          .from("programs")
          .select("id, name, academic_level_id")
          .eq("school_id", schoolId)
          .order("id")
          .range(from, to),
      ).then(checked),
      readAllPages((from, to) =>
        db
          .from("academic_levels")
          .select("id, name")
          .eq("school_id", schoolId)
          .order("id")
          .range(from, to),
      ).then(checked),
    ]);
    const contracts = checked(
      await readInChunks(
        enrollments.map((row) => row.id),
        (ids) =>
          readAllPages((from, to) =>
            db
              .from("finance_contracts")
              .select("id, enrollment_id")
              .eq("school_id", schoolId)
              .in("enrollment_id", ids)
              .order("id")
              .range(from, to),
          ),
      ),
    );
    const invoices = checked(
      await readInChunks(
        contracts.map((row) => row.id),
        (ids) =>
          readAllPages((from, to) =>
            db
              .from("finance_invoices")
              .select("id, contract_id, amount, discount_amount, penalty_amount, due_date, status")
              .eq("school_id", schoolId)
              .in("contract_id", ids)
              .neq("status", "cancelled")
              .order("id")
              .range(from, to),
          ),
      ),
    );
    const receipts = checked(
      await readInChunks(
        invoices.map((row) => row.id),
        (ids) =>
          readAllPages((from, to) =>
            db
              .from("finance_receipts")
              .select("id, invoice_id, amount, status")
              .eq("school_id", schoolId)
              .in("invoice_id", ids)
              .eq("status", "issued")
              .order("id")
              .range(from, to),
          ),
      ),
    );
    const studentIds = [...new Set(enrollments.map((row) => row.student_id))];
    const students = checked(
      await readInChunks(studentIds, (ids) =>
        db
          .from("students")
          .select("id, student_number, person_id")
          .eq("school_id", schoolId)
          .in("id", ids),
      ),
    );
    const people = checked(
      await readInChunks(
        students.map((row) => row.person_id),
        (ids) => db.from("people").select("id, full_name").eq("school_id", schoolId).in("id", ids),
      ),
    );
    const personById = new Map(people.map((row) => [row.id, row]));
    const studentById = new Map(students.map((row) => [row.id, row]));
    const enrollmentById = new Map(enrollments.map((row) => [row.id, row]));
    const studentByContract = new Map(
      contracts.flatMap((row) => {
        const enrollment = enrollmentById.get(row.enrollment_id);
        return enrollment ? [[row.id, enrollment.student_id] as const] : [];
      }),
    );
    const balances = studentBalances(invoices, receipts, studentByContract, schoolTodayIso());
    const groupById = new Map(groups.map((row) => [row.id, row]));
    const gradeById = new Map(grades.map((row) => [row.id, row]));
    const programById = new Map(programs.map((row) => [row.id, row]));
    const levelById = new Map(levels.map((row) => [row.id, row]));
    // Uma linha por pessoa: matrícula activa primeiro, depois a mais recente.
    enrollments.sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        b.enrolled_on.localeCompare(a.enrolled_on) ||
        a.id.localeCompare(b.id),
    );
    const seen = new Set<string>();
    return enrollments
      .flatMap((enrollment) => {
        if (seen.has(enrollment.student_id)) return [];
        seen.add(enrollment.student_id);
        const student = studentById.get(enrollment.student_id);
        if (!student) return [];
        const group = groupById.get(enrollment.class_group_id);
        const grade = group && gradeById.get(group.grade_level_id);
        const program = grade && programById.get(grade.program_id);
        const level = program && levelById.get(program.academic_level_id);
        return [
          {
            studentId: student.id,
            name: personById.get(student.person_id)?.full_name ?? "Aluno",
            number: student.student_number,
            classGroupId: group?.id ?? "",
            className: group?.name ?? "Sem turma",
            gradeId: grade?.id ?? "",
            gradeName: grade?.name ?? "Sem classe",
            programId: program?.id ?? "",
            programName: program?.name ?? "Sem curso",
            levelId: level?.id ?? "",
            levelName: level?.name ?? "Sem nível",
            active: enrollment.status === "active",
            ...(balances.get(student.id) ?? {
              billed: 0,
              paid: 0,
              outstanding: 0,
              overdue: 0,
              invoiceCount: 0,
            }),
          },
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  });
