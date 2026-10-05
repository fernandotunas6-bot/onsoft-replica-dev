import type { SupabaseClient } from "@supabase/supabase-js";
import { schoolTodayIso } from "@/lib/school-date";
import { invoiceNetTotal } from "@/features/finance/invoice-settlement";

export type PersonAcademicSummary = {
  total_enrollments: number;
  active_enrollment: {
    id: string;
    school_class_id: string | null;
    class_name: string | null;
    course_name: string | null;
    academic_year_name: string | null;
    status: string;
  } | null;
};

export type PersonFinancialSummary = {
  balance: number;
  overdue_count: number;
  currency: string;
};

export type PersonContext = {
  roles: string[];
  academic_summary?: PersonAcademicSummary;
  financial_summary?: PersonFinancialSummary;
  has_contact_email: boolean;
};

/**
 * Deriva papéis, resumo académico e resumo financeiro reais de uma pessoa.
 * Aluno/professor/encarregado continuam inferidos das tabelas de domínio.
 * A tabela person_roles, quando instalada, acrescenta vínculos institucionais
 * declarativos sem substituir essas fontes canónicas.
 */
export async function resolvePersonContext(
  db: SupabaseClient,
  schoolId: string,
  personId: string,
  hasContactEmail: boolean,
): Promise<PersonContext> {
  const [studentRow, teacherRow, guardianRow, declaredRoles] = await Promise.all([
    db
      .from("students")
      .select("id, status")
      .eq("school_id", schoolId)
      .eq("person_id", personId)
      .maybeSingle(),
    db
      .from("teachers")
      .select("id, status")
      .eq("school_id", schoolId)
      .eq("person_id", personId)
      .maybeSingle(),
    db
      .from("student_guardians")
      .select("student_id")
      .eq("school_id", schoolId)
      .eq("guardian_person_id", personId)
      .limit(1)
      .maybeSingle(),
    db
      .from("person_roles")
      .select("role")
      .eq("school_id", schoolId)
      .eq("person_id", personId)
      .eq("active", true),
  ]);

  const roles = new Set<string>();
  if (studentRow.data) roles.add("aluno");
  if (teacherRow.data) roles.add("professor");
  if (guardianRow.data) roles.add("encarregado");
  for (const row of declaredRoles.data ?? []) {
    const role = String(row.role ?? "").trim();
    if (role) roles.add(role);
  }

  let academic_summary: PersonAcademicSummary | undefined;
  let financial_summary: PersonFinancialSummary | undefined;

  const studentId = studentRow.data?.id as string | undefined;
  if (studentId) {
    const [{ data: activeEnrollment }, { count: totalEnrollments }, { data: allEnrollments }] =
      await Promise.all([
        db
          .from("enrollments")
          .select("id, class_group_id, academic_year_id, status")
          .eq("school_id", schoolId)
          .eq("student_id", studentId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
        db
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("student_id", studentId),
        db.from("enrollments").select("id").eq("school_id", schoolId).eq("student_id", studentId),
      ]);

    let className: string | null = null;
    let courseName: string | null = null;
    let academicYearName: string | null = null;
    if (activeEnrollment?.class_group_id) {
      // Mesma forma real já confirmada em getStudentProfile (students/server.ts):
      // class_groups tem grade_level_id, não program_id.
      const { data: classGroup } = await db
        .from("class_groups")
        .select("name, grade_level_id, academic_year_id")
        .eq("id", activeEnrollment.class_group_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      className = classGroup?.name ?? null;
      const [gradeResult, yearResult] = await Promise.all([
        classGroup?.grade_level_id
          ? db.from("grade_levels").select("name").eq("id", classGroup.grade_level_id).maybeSingle()
          : Promise.resolve({ data: null }),
        (activeEnrollment.academic_year_id ?? classGroup?.academic_year_id)
          ? db
              .from("academic_years")
              .select("name")
              .eq("id", activeEnrollment.academic_year_id ?? classGroup?.academic_year_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      courseName = (gradeResult.data as { name?: string } | null)?.name ?? null;
      academicYearName = (yearResult.data as { name?: string } | null)?.name ?? null;
    }

    academic_summary = {
      total_enrollments: totalEnrollments ?? 0,
      active_enrollment: activeEnrollment
        ? {
            id: activeEnrollment.id,
            school_class_id: activeEnrollment.class_group_id,
            class_name: className,
            course_name: courseName,
            academic_year_name: academicYearName,
            status: activeEnrollment.status,
          }
        : null,
    };

    const enrollmentIds = (allEnrollments ?? []).map((row: { id: string }) => row.id);
    financial_summary = { balance: 0, overdue_count: 0, currency: "AOA" };
    if (enrollmentIds.length) {
      const { data: contracts } = await db
        .from("finance_contracts")
        .select("id")
        .eq("school_id", schoolId)
        .in("enrollment_id", enrollmentIds);
      const contractIds = (contracts ?? []).map((row: { id: string }) => row.id);
      if (contractIds.length) {
        const { data: invoices } = await db
          .from("finance_invoices")
          .select("id, amount, discount_amount, penalty_amount, due_date, status")
          .eq("school_id", schoolId)
          .in("contract_id", contractIds)
          .neq("status", "cancelled");
        const invoiceIds = (invoices ?? []).map((row: { id: string }) => row.id);
        const { data: receipts } = invoiceIds.length
          ? await db
              .from("finance_receipts")
              .select("invoice_id, amount, status")
              .in("invoice_id", invoiceIds)
          : { data: [] as Array<{ invoice_id: string; amount: number; status: string }> };

        const paidByInvoice = new Map<string, number>();
        for (const receipt of receipts ?? []) {
          if (receipt.status === "reversed") continue;
          paidByInvoice.set(
            receipt.invoice_id,
            (paidByInvoice.get(receipt.invoice_id) ?? 0) + Number(receipt.amount ?? 0),
          );
        }

        const today = schoolTodayIso();
        let balance = 0;
        let overdueCount = 0;
        for (const invoice of invoices ?? []) {
          const amount = invoiceNetTotal(invoice);
          const paid = paidByInvoice.get(invoice.id) ?? 0;
          const open = Math.max(amount - paid, 0);
          balance += open;
          if (open > 0 && invoice.due_date && invoice.due_date < today) overdueCount += 1;
        }
        financial_summary = { balance, overdue_count: overdueCount, currency: "AOA" };
      }
    }
  }

  return {
    roles: [...roles],
    ...(academic_summary !== undefined ? { academic_summary } : {}),
    ...(financial_summary !== undefined ? { financial_summary } : {}),
    has_contact_email: hasContactEmail,
  };
}
