import type { TablesUpdate } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  cancelEnrollmentInputSchema,
  changeStudentStatusInputSchema,
  enrollNewStudentInputSchema,
  enrollStudentInClassInputSchema,
  getStudentInputSchema,
  getStudentStatusHistoryInputSchema,
  batchAssignClassInputSchema,
  batchUpdateStudentStatusInputSchema,
  assignGuardianInputSchema,
  mapSgaGuardianRelationship,
  listEnrollmentsInputSchema,
  removeGuardianInputSchema,
  searchStudentsInputSchema,
  updateEnrollmentAttendanceInputSchema,
  updateStudentProfileInputSchema,
} from "./schemas";
import { deriveAcademicStatus, deriveFinancialSnapshot, type InvoiceLike } from "./academic-status";
import { recordStudentStatusHistory, recordStudentStatusHistoryBatch } from "./status-history";
import {
  CURRENT_ENROLLMENT_STATUSES,
  closeCurrentEnrollmentsForStatus,
  hasCurrentEnrollment,
} from "./enrollment-sync";
import {
  ENROLLMENT_2FA_MESSAGE,
  assertClassAcceptsEnrollment,
  enrollStudentRpc,
  heldStudentMessage,
  placeStudentInClass,
  registerStudentRpc,
  reopenReturningStudents,
  restoreStudentStatuses,
  rpcFailureError,
  syncStudentStatusAfterPlacement,
  RETURNING_STUDENT_STATUSES,
} from "./enrollment-core";
import { buildPersonInsert, isMissingPeopleGeography } from "@/features/people/person-fields";
import { syncBiDocumentFromNif } from "@/features/people/bi-document";
import { requireAal2 } from "@/features/hr/require-aal2";
import { assertCanSeeStudent, loadStudentScope } from "./student-scope";
import { recordAccessAudit, recordAuditBatch } from "@/features/audit/record-audit";
import { queueTenantUsageSync } from "@/features/saas/usage-sync";
import { assertCanAddStudentForSchool } from "@/features/saas/tenant-limits-server";
import { schoolTodayIso } from "@/lib/school-date";

async function linkGuardian(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  input: {
    schoolId: string;
    studentId: string;
    guardianPersonId: string;
    relationship: string;
    isPrimary: boolean;
    userId: string;
  },
) {
  if (input.isPrimary) {
    // Se falhar, o aluno ficava com dois encarregados principais.
    const { error: primaryError } = await db
      .from("student_guardians")
      .update({ is_primary: false })
      .eq("school_id", input.schoolId)
      .eq("student_id", input.studentId)
      .eq("is_primary", true);
    if (primaryError) {
      throw publicDatabaseError(primaryError, "Não foi possível trocar o encarregado principal.");
    }
  }

  // SGA: id PK, is_pickup_authorized, created_by NOT NULL; no updated_by / authorized_pickup.
  const { error } = await db.from("student_guardians").insert({
    school_id: input.schoolId,
    student_id: input.studentId,
    guardian_person_id: input.guardianPersonId,
    relationship: mapSgaGuardianRelationship(input.relationship),
    is_primary: input.isPrimary,
    is_pickup_authorized: true,
    created_by: input.userId,
  });
  if (error) throw publicDatabaseError(error, "Não foi possível associar o encarregado.");
}

type StudentListRow = {
  id: string;
  registration_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  student_status: string;
  payment_status: string | null;
  grade_name: string | null;
  class_name: string | null;
  class_group_id: string | null;
  academic_year: string | null;
  primary_guardian_name: string | null;
  person_id: string;
  school_id: string;
  debt_amount?: number;
  overdue_count?: number;
  has_debt?: boolean;
  total_billed?: number;
  total_paid?: number;
  national_id?: string | null;
};

export const searchStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchStudentsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const scope = await loadStudentScope(db, membership, context.userId);
    if (!scope.all && scope.studentIds.length === 0) return [];

    let studentsQuery = db
      .from("students")
      .select("id, student_number, status, person_id, school_id, admission_date")
      .eq("school_id", membership.schoolId);
    if (!scope.all) studentsQuery = studentsQuery.in("id", scope.studentIds);
    const { data: students, error } = await studentsQuery
      .order("student_number")
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw publicDatabaseError(error, "Não foi possível pesquisar os alunos.");

    const rows = students ?? [];
    const personIds = [...new Set(rows.map((row: { person_id: string }) => row.person_id))];
    const studentIds = rows.map((row: { id: string }) => row.id);

    const [{ data: people }, { data: allEnrollments }, { data: guardians }] = await Promise.all([
      personIds.length
        ? db
            .from("people")
            .select("id, full_name, email, phone, photo_url, national_id")
            .eq("school_id", membership.schoolId)
            .in("id", personIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              full_name: string;
              email: string | null;
              phone: string | null;
              photo_url?: string | null;
              national_id?: string | null;
            }>,
          }),
      studentIds.length
        ? db
            .from("enrollments")
            .select("id, student_id, class_group_id, academic_year_id, status, enrolled_on")
            .in("student_id", studentIds)
            .eq("school_id", membership.schoolId)
            .order("enrolled_on", { ascending: false })
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              student_id: string;
              class_group_id: string | null;
              academic_year_id: string | null;
              status: string;
              enrolled_on?: string | null;
            }>,
          }),
      studentIds.length
        ? db
            .from("student_guardians")
            .select("student_id, guardian_person_id, is_primary")
            .in("student_id", studentIds)
            .eq("school_id", membership.schoolId)
            .eq("is_primary", true)
        : Promise.resolve({
            data: [] as Array<{
              student_id: string;
              guardian_person_id: string;
              is_primary: boolean;
            }>,
          }),
    ]);

    // Map de matrículas: prioriza a matrícula activa; se não houver, usa a mais recente
    const enrollmentByStudent = new Map<string, Record<string, unknown>>();
    for (const enr of allEnrollments ?? []) {
      const existing = enrollmentByStudent.get(enr.student_id);
      if (!existing || enr.status === "active") {
        enrollmentByStudent.set(enr.student_id, enr as Record<string, unknown>);
      }
    }

    // Carregamento financeiro para os alunos pesquisados
    const enrollmentIds = (allEnrollments ?? []).map((e) => e.id);
    let invoicesByStudent = new Map<string, InvoiceLike[]>();
    try {
      if (enrollmentIds.length) {
        const { data: contracts } = await db
          .from("finance_contracts")
          .select("id, enrollment_id")
          .in("enrollment_id", enrollmentIds)
          .eq("school_id", membership.schoolId);

        const contractIds = (contracts ?? []).map((c) => c.id);
        if (contractIds.length) {
          const { data: invoices } = await db
            .from("finance_invoices")
            .select("id, contract_id, amount, discount_amount, due_date, status")
            .in("contract_id", contractIds)
            .eq("school_id", membership.schoolId)
            .neq("status", "cancelled");

          const invoiceIds = (invoices ?? []).map((inv) => inv.id);
          const { data: receipts } = invoiceIds.length
            ? await db
                .from("finance_receipts")
                .select("invoice_id, amount, status")
                .in("invoice_id", invoiceIds)
                .eq("school_id", membership.schoolId)
            : { data: [] };

          const paidByInvoice = new Map<string, number>();
          for (const r of receipts ?? []) {
            if (r.status === "reversed") continue;
            paidByInvoice.set(
              r.invoice_id,
              (paidByInvoice.get(r.invoice_id) ?? 0) + Number(r.amount ?? 0),
            );
          }

          const studentIdByContract = new Map<string, string>();
          const studentByEnrollment = new Map(
            (allEnrollments ?? []).map((e) => [e.id, e.student_id]),
          );
          for (const c of contracts ?? []) {
            const sid = studentByEnrollment.get(c.enrollment_id);
            if (sid) studentIdByContract.set(c.id, sid);
          }

          for (const inv of invoices ?? []) {
            const sid = studentIdByContract.get(inv.contract_id);
            if (sid) {
              const list = invoicesByStudent.get(sid) ?? [];
              list.push({
                id: inv.id,
                amount: inv.amount,
                discount_amount: inv.discount_amount,
                amount_paid: paidByInvoice.get(inv.id) ?? 0,
                due_date: inv.due_date,
                status: inv.status,
              });
              invoicesByStudent.set(sid, list);
            }
          }
        }
      }
    } catch {
      // Fallback gracioso caso o módulo financeiro ainda não esteja provisionado
      invoicesByStudent = new Map();
    }

    const peopleById = new Map(
      (people ?? []).map((person: { id: string }) => [
        person.id,
        person as Record<string, unknown>,
      ]),
    );
    const classGroupIds = [
      ...new Set(
        (allEnrollments ?? [])
          .map((row: { class_group_id: string | null }) => row.class_group_id)
          .filter(Boolean),
      ),
    ] as string[];
    const yearIds = [
      ...new Set(
        (allEnrollments ?? [])
          .map((row: { academic_year_id: string | null }) => row.academic_year_id)
          .filter(Boolean),
      ),
    ] as string[];
    const guardianPersonIds = [
      ...new Set(
        (guardians ?? []).map((row: { guardian_person_id: string }) => row.guardian_person_id),
      ),
    ];

    const [{ data: classGroups }, { data: years }, { data: guardianPeople }] = await Promise.all([
      classGroupIds.length
        ? db
            .from("class_groups")
            .select("id, name, grade_level_id")
            .eq("school_id", membership.schoolId)
            .in("id", classGroupIds)
        : Promise.resolve({
            data: [] as Array<{ id: string; name: string; grade_level_id: string | null }>,
          }),
      yearIds.length
        ? db
            .from("academic_years")
            .select("id, name")
            .eq("school_id", membership.schoolId)
            .in("id", yearIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      guardianPersonIds.length
        ? db
            .from("people")
            .select("id, full_name")
            .eq("school_id", membership.schoolId)
            .in("id", guardianPersonIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
    ]);

    const gradeLevelIds = [
      ...new Set(
        (classGroups ?? [])
          .map((row: { grade_level_id: string | null }) => row.grade_level_id)
          .filter(Boolean),
      ),
    ] as string[];
    const { data: gradeLevels } = gradeLevelIds.length
      ? await db
          .from("grade_levels")
          .select("id, name")
          .eq("school_id", membership.schoolId)
          .in("id", gradeLevelIds)
      : { data: [] as Array<{ id: string; name: string }> };

    const classById = new Map(
      (classGroups ?? []).map((row: { id: string }) => [row.id, row as Record<string, unknown>]),
    );
    const yearById = new Map(
      (years ?? []).map((row: { id: string }) => [row.id, row as Record<string, unknown>]),
    );
    const gradeById = new Map(
      (gradeLevels ?? []).map((row: { id: string }) => [row.id, row as Record<string, unknown>]),
    );
    const guardianByStudent = new Map(
      (guardians ?? []).map((row: { student_id: string; guardian_person_id: string }) => [
        row.student_id,
        row.guardian_person_id,
      ]),
    );
    const guardianNameById = new Map(
      (guardianPeople ?? []).map((row: { id: string; full_name: string }) => [
        row.id,
        row.full_name,
      ]),
    );

    const query = (data.query ?? "").trim().toLowerCase();
    const mapped: StudentListRow[] = rows.map(
      (student: {
        id: string;
        student_number: string;
        status: string;
        person_id: string;
        school_id: string;
      }) => {
        const person = peopleById.get(student.person_id);
        const enrollment = enrollmentByStudent.get(student.id);
        const classGroup = enrollment?.["class_group_id"]
          ? classById.get(String(enrollment["class_group_id"]))
          : null;
        const grade = classGroup?.["grade_level_id"]
          ? gradeById.get(String(classGroup["grade_level_id"]))
          : null;
        const year = enrollment?.["academic_year_id"]
          ? yearById.get(String(enrollment["academic_year_id"]))
          : null;
        const guardianId = guardianByStudent.get(student.id);
        const enrollmentStatus = enrollment?.["status"] ? String(enrollment["status"]) : null;
        const hasClassGroup = Boolean(enrollment?.["class_group_id"]);
        const effectiveStatus = deriveAcademicStatus({
          studentStatus: student.status,
          enrollmentStatus,
          hasClassGroup,
        });

        const studentInvs = invoicesByStudent.get(student.id) ?? [];
        const finSnapshot = deriveFinancialSnapshot(studentInvs);

        return {
          id: student.id,
          registration_number: student.student_number,
          full_name: String(person?.["full_name"] ?? "—"),
          email: (person?.["email"] as string | null) ?? null,
          phone: (person?.["phone"] as string | null) ?? null,
          photo_url: (person?.["photo_url"] as string | null) ?? null,
          national_id: (person?.["national_id"] as string | null) ?? null,
          student_status: effectiveStatus,
          payment_status: finSnapshot.paymentStatus,
          debt_amount: finSnapshot.debtAmount,
          overdue_count: finSnapshot.overdueCount,
          has_debt: finSnapshot.hasDebt,
          total_billed: finSnapshot.totalBilled,
          total_paid: finSnapshot.totalPaid,
          grade_name: (grade?.["name"] as string | null) ?? null,
          class_name: (classGroup?.["name"] as string | null) ?? null,
          class_group_id: (classGroup?.["id"] as string | null) ?? null,
          academic_year: (year?.["name"] as string | null) ?? null,
          primary_guardian_name: guardianId ? (guardianNameById.get(guardianId) ?? null) : null,
          person_id: student.person_id,
          school_id: student.school_id,
        };
      },
    );

    // Um candidato com matrícula activa já aparece como activo (`deriveAcademicStatus`).
    // Esta leitura gravava-o como activo na base: uma escrita sem histórico, feita por
    // quem só podia ler e mesmo numa escola bloqueada para escrita (auditoria 14).
    // As colocações em turma passam por `placeStudentInClass`, que o activa.

    if (!query) return mapped;
    return mapped.filter(
      (row) =>
        row.full_name.toLowerCase().includes(query) ||
        row.registration_number.toLowerCase().includes(query) ||
        (row.email ?? "").toLowerCase().includes(query) ||
        (row.phone ?? "").toLowerCase().includes(query) ||
        (row.national_id ?? "").toLowerCase().includes(query) ||
        (row.class_name ?? "").toLowerCase().includes(query) ||
        (row.grade_name ?? "").toLowerCase().includes(query) ||
        (row.primary_guardian_name ?? "").toLowerCase().includes(query),
    );
  });

export const getStudentProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getStudentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    assertCanSeeStudent(await loadStudentScope(db, membership, context.userId), data.id);
    const { data: student, error: studentError } = await db
      .from("students")
      .select(
        "id, student_number, status, person_id, school_id, admission_date, created_at, updated_at",
      )
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (studentError) throw publicDatabaseError(studentError, "Não foi possível carregar o aluno.");
    if (!student) throw new Error("Aluno não encontrado");

    const [personResult, guardiansResult, enrollmentResult] = await Promise.all([
      db
        .from("people")
        .select(
          "id, full_name, preferred_name, email, phone, date_of_birth, sex, national_id, status, photo_url, province, municipality, commune, address",
        )
        .eq("id", student.person_id)
        .eq("school_id", membership.schoolId)
        .maybeSingle()
        .then(async (result) => {
          if (result.error && isMissingPeopleGeography(result.error)) {
            return db
              .from("people")
              .select(
                "id, full_name, preferred_name, email, phone, date_of_birth, sex, national_id, status, photo_url",
              )
              .eq("id", student.person_id)
              .eq("school_id", membership.schoolId)
              .maybeSingle();
          }
          if (result.error && /photo_url|42703|schema cache/i.test(result.error.message)) {
            return db
              .from("people")
              .select(
                "id, full_name, preferred_name, email, phone, date_of_birth, sex, national_id, status",
              )
              .eq("id", student.person_id)
              .eq("school_id", membership.schoolId)
              .maybeSingle();
          }
          return result;
        }),
      db
        .from("student_guardians")
        .select("guardian_person_id, relationship, is_primary")
        .eq("student_id", student.id)
        .eq("school_id", membership.schoolId),
      // Matrícula corrente: a activa e, sem ela, a pendente (que já ocupa lugar na
      // turma); «active» ordena antes de «pending». Só a activa deixava a ficha sem
      // turma para quem estava pendente.
      db
        .from("enrollments")
        .select(
          "id, class_group_id, academic_year_id, status, enrolled_on, attendance_rate, final_average",
        )
        .eq("student_id", student.id)
        .eq("school_id", membership.schoolId)
        .in("status", [...CURRENT_ENROLLMENT_STATUSES])
        .order("status", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    const person = personResult.data as {
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
      sex?: string | null;
      date_of_birth?: string | null;
      national_id?: string | null;
      photo_url?: string | null;
      province?: string | null;
      municipality?: string | null;
      commune?: string | null;
      address?: string | null;
    } | null;
    const guardians = guardiansResult.data;
    let enrollment = enrollmentResult.data as {
      id: string;
      class_group_id: string | null;
      academic_year_id: string | null;
      status: string;
      enrolled_on: string | null;
      attendance_rate?: number | null;
      final_average?: number | null;
    } | null;
    if (
      enrollmentResult.error &&
      /attendance_rate|final_average|42703|schema cache/i.test(enrollmentResult.error.message)
    ) {
      const fallback = await db
        .from("enrollments")
        .select("id, class_group_id, academic_year_id, status, enrolled_on")
        .eq("student_id", student.id)
        .eq("school_id", membership.schoolId)
        .in("status", [...CURRENT_ENROLLMENT_STATUSES])
        .order("status", { ascending: true })
        .limit(1)
        .maybeSingle();
      enrollment = fallback.data
        ? { ...fallback.data, attendance_rate: null, final_average: null }
        : null;
    } else if (enrollmentResult.error) {
      throw publicDatabaseError(enrollmentResult.error, "Não foi possível carregar a matrícula.");
    }

    const guardianIds = (guardians ?? []).map(
      (row: { guardian_person_id: string }) => row.guardian_person_id,
    );
    const { data: guardianPeople } = guardianIds.length
      ? await db
          .from("people")
          .select("id, full_name, phone, email")
          .eq("school_id", membership.schoolId)
          .in("id", guardianIds)
      : { data: [] as Array<Record<string, unknown>> };
    const guardianRows = (guardianPeople ?? []) as Array<Record<string, unknown>>;
    const guardianById = new Map(
      guardianRows.map((row) => [String(row["id"] ?? ""), row] as const),
    );

    let className: string | null = null;
    let gradeName: string | null = null;
    let academicYear: string | null = null;
    if (enrollment?.class_group_id) {
      const { data: classGroup } = await db
        .from("class_groups")
        .select("name, grade_level_id, academic_year_id")
        .eq("id", enrollment.class_group_id)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      className = classGroup?.name ?? null;
      if (classGroup?.grade_level_id) {
        const { data: grade } = await db
          .from("grade_levels")
          .select("name")
          .eq("id", classGroup.grade_level_id)
          .eq("school_id", membership.schoolId)
          .maybeSingle();
        gradeName = grade?.name ?? null;
      }
      const yearId = enrollment.academic_year_id ?? classGroup?.academic_year_id;
      if (yearId) {
        const { data: year } = await db
          .from("academic_years")
          .select("name")
          .eq("id", yearId)
          .eq("school_id", membership.schoolId)
          .maybeSingle();
        academicYear = year?.name ?? null;
      }
    }

    return {
      student: {
        id: student.id,
        registration_number: student.student_number,
        full_name: person?.full_name ?? "—",
        email: person?.email ?? null,
        phone: person?.phone ?? null,
        national_id: person?.national_id ?? null,
        student_status: student.status,
        payment_status: null,
        grade_name: gradeName,
        class_name: className,
        academic_year: academicYear,
        person_id: student.person_id,
        school_id: student.school_id,
        admitted_on: student.admission_date,
        version: 1,
        person_version: 1,
        enrollment_id: enrollment?.id ?? null,
        enrollment_status: enrollment?.status ?? null,
        enrolled_on: enrollment?.enrolled_on ?? null,
        class_group_id: enrollment?.class_group_id ?? null,
        academic_year_id: enrollment?.academic_year_id ?? null,
        final_average: enrollment?.final_average == null ? null : Number(enrollment.final_average),
        attendance_rate:
          enrollment?.attendance_rate == null ? null : Number(enrollment.attendance_rate),
        province: person?.province ?? null,
        municipality: person?.municipality ?? null,
        commune: person?.commune ?? null,
        address: person?.address ?? null,
        gender: person?.sex ?? null,
        birth_date: person?.date_of_birth ?? null,
        photo_url: person?.photo_url ?? null,
      },
      guardians: (guardians ?? []).map(
        (row: { guardian_person_id: string; relationship: string; is_primary: boolean }) => {
          const guardian = guardianById.get(row.guardian_person_id);
          return {
            guardian_person_id: row.guardian_person_id,
            relationship: row.relationship,
            is_primary: row.is_primary,
            guardian: guardian
              ? {
                  id: String(guardian["id"] ?? ""),
                  full_name: String(guardian["full_name"] ?? "—"),
                  phone_primary: (guardian["phone"] as string | null) ?? null,
                  email: (guardian["email"] as string | null) ?? null,
                }
              : null,
          };
        },
      ),
    };
  });

export const enrollNewStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => enrollNewStudentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    // register_student e enroll_student exigem 2FA: verificado antes de criar a
    // pessoa, em vez de a criar e apagar a seguir.
    requireAal2(context.claims, "Matricular um aluno");
    const db = await loadSgaAdminClient();

    await assertCanAddStudentForSchool(membership.schoolId);

    const admittedOn = data.admittedOn ?? schoolTodayIso();
    // Turma cheia, ano por abrir ou data fora do ano: recusado antes de criar o aluno.
    const classGroup = data.classGroupId
      ? await assertClassAcceptsEnrollment(db, {
          schoolId: membership.schoolId,
          classGroupId: data.classGroupId,
          academicYearId: data.academicYearId ?? null,
          enrolledOn: admittedOn,
        })
      : null;

    const { payload: personPayload, hasGeography } = buildPersonInsert(data.person, {
      schoolId: membership.schoolId,
      userId: context.userId,
    });
    if (!personPayload.full_name) throw new Error("Nome do aluno é obrigatório.");
    const { data: person, error: personError } = await db
      .from("people")
      .insert(personPayload)
      .select("id")
      .single();
    if (personError && hasGeography && isMissingPeopleGeography(personError)) {
      throw new Error(
        "A localização do aluno não pôde ser guardada porque a migration de Pessoas ainda não foi aplicada.",
      );
    }
    if (personError) throw publicDatabaseError(personError, "Não foi possível criar a pessoa.");

    // register_student cria o aluno (+ 1º encarregado) numa transação atómica, com o
    // número de processo da sequência própria.
    const [firstGuardian, ...otherGuardians] = data.guardians ?? [];
    const registered = await registerStudentRpc(context.supabase, {
      schoolId: membership.schoolId,
      personId: person.id,
      admissionDate: admittedOn,
      guardian: firstGuardian
        ? {
            personId: firstGuardian.guardian_person_id,
            relationship: firstGuardian.relationship,
            isPrimary: firstGuardian.is_primary,
            pickup: firstGuardian.authorized_pickup,
          }
        : null,
    });
    if (!registered.ok) {
      // Compensa o insert de people acima: sem aluno, a pessoa ficava órfã.
      await db.from("people").delete().eq("id", person.id);
      throw rpcFailureError(registered, { fallback: "Não foi possível concluir a matrícula." });
    }
    const studentOutcome = registered.value;

    for (const guardian of otherGuardians) {
      await linkGuardian(db, {
        schoolId: membership.schoolId,
        studentId: studentOutcome.studentId,
        guardianPersonId: guardian.guardian_person_id,
        relationship: guardian.relationship,
        isPrimary: guardian.is_primary,
        userId: context.userId,
      });
    }

    let enrollmentNumber: string | null = null;
    if (classGroup) {
      const enrolled = await enrollStudentRpc(context.supabase, {
        schoolId: membership.schoolId,
        studentId: studentOutcome.studentId,
        classGroupId: classGroup.id,
        enrolledOn: admittedOn,
      });
      if (!enrolled.ok) {
        throw rpcFailureError(enrolled, {
          auth: "Aluno criado, mas esta conta precisa de 2FA activo para o matricular numa turma.",
          fallback: "Aluno criado, mas falhou a matrícula na turma.",
        });
      }
      enrollmentNumber = enrolled.value.enrollmentNumber;
    }

    // O BI também em `person_documents`, como ao aceitar uma candidatura. No fim e sem
    // parar a matrícula: o aluno já existe e o documento é secundário.
    await syncBiDocumentFromNif(
      db,
      membership.schoolId,
      person.id,
      personPayload.national_id,
      context.userId,
    ).catch((error) => console.error("[matricula] documento BI por registar", person.id, error));

    queueTenantUsageSync(membership.schoolId);

    const finalStatus = enrollmentNumber ? "active" : studentOutcome.status;
    await recordStudentStatusHistory(db, {
      schoolId: membership.schoolId,
      studentId: studentOutcome.studentId,
      previousStatus: null,
      newStatus: finalStatus,
      reason: enrollmentNumber ? "Nova matrícula interna com turma" : "Nova matrícula interna",
      changedBy: context.userId,
    });

    return {
      id: studentOutcome.studentId,
      student_number: studentOutcome.studentNumber,
      status: finalStatus,
      person_id: person.id,
      enrollment_number: enrollmentNumber,
    };
  });

export const changeStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => changeStudentStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const statusMap: Record<string, string> = {
      active: "active",
      inactive: "inactive",
      transferred: "transferred",
      graduated: "graduated",
      applicant: "applicant",
    };
    const nextStatus = statusMap[data.newStatus] ?? data.newStatus;
    const { data: currentStudent } = await db
      .from("students")
      .select("id, status, student_number")
      .eq("id", data.studentId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    const previousStatus = currentStudent?.status ?? null;

    const { data: student, error } = await db
      .from("students")
      .update({ status: nextStatus, updated_by: context.userId })
      .eq("id", data.studentId)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível alterar o estado do aluno.");
    if (!student) throw new Error("Aluno não encontrado");

    // Transferido, concluído ou inactivo deixa de ocupar lugar na turma.
    const closedEnrollments = await closeCurrentEnrollmentsForStatus(db, {
      schoolId: membership.schoolId,
      studentIds: [data.studentId],
      studentStatus: nextStatus,
      reason: data.reason,
      userId: context.userId,
    });

    await recordStudentStatusHistory(db, {
      schoolId: membership.schoolId,
      studentId: data.studentId,
      previousStatus,
      newStatus: nextStatus,
      reason: data.reason || null,
      changedBy: context.userId,
    });

    try {
      // `audit_logs` tem `actor_user_id` e um `metadata` jsonb — não `actor_id`,
      // `reason`, `before_data` nem `after_data`. Com esses nomes o PostgREST recusava
      // a linha inteira, e o `catch` vazio engolia o erro: a mudança de estado do aluno
      // nunca deixou rasto de auditoria.
      await db.from("audit_logs").insert({
        school_id: membership.schoolId,
        actor_user_id: context.userId,
        action: "student.status_change",
        entity_type: "student",
        entity_id: data.studentId,
        metadata: {
          reason: data.reason || null,
          before: { status: previousStatus },
          after: { status: nextStatus },
          enrollments_closed: closedEnrollments,
        },
      });
    } catch {
      // Fallback
    }

    queueTenantUsageSync(membership.schoolId);
    return student;
  });

export const updateStudentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateStudentProfileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const personPatch: TablesUpdate<"people"> = {
      full_name: data.fullName,
      email: data.email || null,
      phone: data.phone ?? null,
      updated_by: context.userId,
    };
    const hasGeography = Boolean(
      data.province || data.municipality || data.commune || data.address,
    );
    if (hasGeography) {
      personPatch["province"] = data.province || null;
      personPatch["municipality"] = data.municipality || null;
      personPatch["commune"] = data.commune || null;
      personPatch["address"] = data.address || null;
    }

    const { data: person, error } = await db
      .from("people")
      .update(personPatch)
      .eq("id", data.personId)
      .eq("school_id", membership.schoolId)
      .select("id")
      .maybeSingle();
    if (error && hasGeography && isMissingPeopleGeography(error)) {
      throw new Error(
        "A localização não pôde ser actualizada porque a migration de Pessoas ainda não foi aplicada.",
      );
    }
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a ficha.");
    if (!person) throw new Error("Pessoa não encontrada.");
    return { id: person.id, version: data.expectedVersion };
  });

/**
 * «Turma», «Mudar» (lista), «Atribuir/Alterar turma» (ficha) e a colocação de um
 * candidato aceite: todos passam por `placeStudentInClass`. Antes havia três
 * caminhos (esta função, `updateEnrollment` e o lote), cada um com a sua regra
 * para o ano lectivo e para o estado do aluno.
 */
export const enrollStudentInClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => enrollStudentInClassInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const placed = await placeStudentInClass(db, context.supabase, {
      schoolId: membership.schoolId,
      studentId: data.studentId,
      classGroupId: data.classGroupId,
      academicYearId: data.academicYearId ?? null,
      enrolledOn: data.enrolledOn ?? null,
      userId: context.userId,
      hasAal2: context.claims?.["aal"] === "aal2",
    });
    queueTenantUsageSync(membership.schoolId);
    return {
      id: placed.enrollmentId,
      enrollment_number: placed.enrollmentNumber,
      class_group_id: placed.classGroupId,
      student_id: data.studentId,
      academic_year_id: placed.academicYearId,
      status: placed.status,
      moved: placed.moved,
    };
  });

export const listEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listEnrollmentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Tesouraria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    // O professor só vê os alunos das suas turmas (como `searchStudents`); sem isto
    // recebia as matrículas da escola inteira.
    const scope = await loadStudentScope(db, membership, context.userId);
    if (!scope.all && scope.studentIds.length === 0) return [];

    let query = db
      .from("enrollments")
      .select(
        "id, enrollment_number, status, enrolled_on, student_id, class_group_id, academic_year_id, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .order("enrolled_on", { ascending: false })
      .limit(data.limit);
    if (data.academicYearId) query = query.eq("academic_year_id", data.academicYearId);
    if (data.classGroupId) query = query.eq("class_group_id", data.classGroupId);
    if (data.status && data.status !== "todos") query = query.eq("status", data.status);
    // Lista curta vai no pedido (o limite conta só os visíveis); longa, filtra-se abaixo.
    if (!scope.all && scope.studentIds.length <= 200) {
      query = query.in("student_id", scope.studentIds);
    }

    const { data: allEnrollments, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as matrículas.");
    const visible = scope.all ? null : new Set(scope.studentIds);
    const enrollments = (allEnrollments ?? []).filter(
      (row) => !visible || visible.has(String(row.student_id)),
    );

    const studentIds = [...new Set((enrollments ?? []).map((row) => row.student_id))];
    const classIds = [...new Set((enrollments ?? []).map((row) => row.class_group_id))];
    const [{ data: students }, { data: groups }] = await Promise.all([
      studentIds.length
        ? db
            .from("students")
            .select("id, student_number, person_id")
            .eq("school_id", membership.schoolId)
            .in("id", studentIds)
        : Promise.resolve({
            data: [] as Array<{ id: string; student_number: string; person_id: string }>,
          }),
      classIds.length
        ? db
            .from("class_groups")
            .select("id, name")
            .eq("school_id", membership.schoolId)
            .in("id", classIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const personIds = [...new Set((students ?? []).map((row) => row.person_id))];
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name")
          .eq("school_id", membership.schoolId)
          .in("id", personIds)
      : { data: [] as Array<{ id: string; full_name: string }> };

    const peopleById = new Map((people ?? []).map((row) => [row.id, row.full_name]));
    const studentById = new Map((students ?? []).map((row) => [row.id, row]));
    const groupById = new Map((groups ?? []).map((row) => [row.id, row.name]));
    const q = (data.query ?? "").trim().toLowerCase();

    return (enrollments ?? [])
      .map((row) => {
        const student = studentById.get(row.student_id);
        const fullName = student ? (peopleById.get(student.person_id) ?? "Aluno") : "Aluno";
        return {
          id: row.id as string,
          enrollment_number: row.enrollment_number as string,
          status: row.status as string,
          enrolled_on: row.enrolled_on as string,
          student_id: row.student_id as string,
          student_name: fullName,
          registration_number: student?.student_number ?? "—",
          class_group_id: row.class_group_id as string,
          class_name: groupById.get(row.class_group_id) ?? "—",
          academic_year_id: row.academic_year_id as string,
        };
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.student_name.toLowerCase().includes(q) ||
          row.registration_number.toLowerCase().includes(q) ||
          row.enrollment_number.toLowerCase().includes(q) ||
          row.class_name.toLowerCase().includes(q)
        );
      });
  });

export const updateEnrollmentAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateEnrollmentAttendanceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: enrollment, error } = await db
      .from("enrollments")
      .update({
        attendance_rate: data.attendanceRate,
        updated_by: context.userId,
      })
      .eq("id", data.enrollmentId)
      .eq("school_id", membership.schoolId)
      .select("id, attendance_rate")
      .maybeSingle();
    if (error && /attendance_rate|42703|schema cache/i.test(error.message)) {
      throw new Error(
        "A coluna de presença ainda não existe no SGA. Aplique APPLY_IN_SQL_EDITOR.sql.",
      );
    }
    if (error) throw publicDatabaseError(error, "Não foi possível guardar a taxa de presença.");
    if (!enrollment) throw new Error("Matrícula não encontrada.");
    return enrollment;
  });

export const cancelEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancelEnrollmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    // `enrollments.status` só aceita pending/active/transferred/completed/cancelled.
    // Antes tentava "withdrawn" e depois "inactive" — ambos recusados pela base, por
    // isso nenhuma matrícula era anulada. O motivo vai para `end_reason` (3–300
    // caracteres pela regra da tabela); `ended_on` fica vazio, o que a base aceita
    // num estado final e evita a regra `ended_on >= enrolled_on`.
    const reason = data.reason?.trim() ?? "";
    const { data: enrollment, error } = await db
      .from("enrollments")
      .update({
        status: "cancelled",
        ...(reason.length >= 3 ? { end_reason: reason.slice(0, 300) } : {}),
        updated_by: context.userId,
      })
      .eq("id", data.enrollmentId)
      .eq("school_id", membership.schoolId)
      .select("id, status, student_id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível anular a matrícula.");
    if (!enrollment) throw new Error("Matrícula não encontrada.");

    // Sem outra matrícula corrente, o aluno deixa de estar activo (auditoria 13, A4).
    // Matriculá-lo de novo volta a pô-lo activo (enrollStudentInClass).
    const studentId = String(enrollment.student_id);
    if (!(await hasCurrentEnrollment(db, membership.schoolId, studentId))) {
      const { data: deactivated, error: studentError } = await db
        .from("students")
        .update({ status: "inactive", updated_by: context.userId })
        .eq("id", studentId)
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .select("id")
        .maybeSingle();
      if (studentError) {
        throw publicDatabaseError(studentError, "Matrícula anulada, mas o aluno ficou activo.");
      }
      if (deactivated) {
        await recordStudentStatusHistory(db, {
          schoolId: membership.schoolId,
          studentId,
          previousStatus: "active",
          newStatus: "inactive",
          reason: reason.length >= 3 ? `Matrícula anulada: ${reason}` : "Matrícula anulada",
          changedBy: context.userId,
        });
        queueTenantUsageSync(membership.schoolId);
      }
    }
    return enrollment;
  });

export const listAcademicDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const [years, programs, grades, groups] = await Promise.all([
      db
        .from("academic_years")
        .select("*")
        .eq("school_id", membership.schoolId)
        .order("starts_on", { ascending: false }),
      db
        .from("programs")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("is_active", true)
        .order("name"),
      db
        .from("grade_levels")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("is_active", true)
        .order("sequence"),
      db.from("class_groups").select("*").eq("school_id", membership.schoolId).order("name"),
    ]);
    if (years.error)
      throw publicDatabaseError(years.error, "Não foi possível carregar os anos lectivos.");
    if (programs.error)
      throw publicDatabaseError(programs.error, "Não foi possível carregar os cursos.");
    if (grades.error)
      throw publicDatabaseError(grades.error, "Não foi possível carregar as classes.");
    if (groups.error)
      throw publicDatabaseError(groups.error, "Não foi possível carregar as turmas.");
    return {
      academicYears: years.data,
      courses: programs.data,
      gradeLevels: grades.data,
      classGroups: groups.data,
    };
  });

export const assignGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignGuardianInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: student, error: studentError } = await db
      .from("students")
      .select("id, person_id")
      .eq("id", data.studentId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (studentError) throw publicDatabaseError(studentError, "Não foi possível validar o aluno.");
    if (!student) throw new Error("Aluno não encontrado.");
    if (student.person_id === data.guardianPersonId) {
      throw new Error("O aluno não pode ser encarregado de si próprio.");
    }

    const { data: person, error: personError } = await db
      .from("people")
      .select("id, status")
      .eq("id", data.guardianPersonId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (personError) throw publicDatabaseError(personError, "Não foi possível validar a pessoa.");
    if (!person) throw new Error("Pessoa não encontrada nesta escola.");
    if (person.status === "inactive" || person.status === "archived") {
      throw new Error("Esta ficha está inactiva. Reactive-a em Pessoas antes de associar.");
    }

    await linkGuardian(db, {
      schoolId: membership.schoolId,
      studentId: data.studentId,
      guardianPersonId: data.guardianPersonId,
      relationship: data.relationship,
      isPrimary: data.isPrimary,
      userId: context.userId,
    });
    // Quem é encarregado decide quem vê os dados do aluno: fica registado.
    await recordAccessAudit({
      schoolId: membership.schoolId,
      actorUserId: context.userId,
      action: "students.guardian_linked",
      entityType: "student",
      entityId: data.studentId,
      metadata: {
        guardian_person_id: data.guardianPersonId,
        relationship: data.relationship ?? null,
      },
    });
    return { studentId: data.studentId, guardianPersonId: data.guardianPersonId };
  });

export const removeGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => removeGuardianInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { error } = await db
      .from("student_guardians")
      .delete()
      .eq("student_id", data.studentId)
      .eq("guardian_person_id", data.guardianPersonId)
      .eq("school_id", membership.schoolId);
    if (error) throw publicDatabaseError(error, "Não foi possível remover o encarregado.");
    // Quem é encarregado decide quem vê os dados do aluno: fica registado.
    await recordAccessAudit({
      schoolId: membership.schoolId,
      actorUserId: context.userId,
      action: "students.guardian_unlinked",
      entityType: "student",
      entityId: data.studentId,
      metadata: { guardian_person_id: data.guardianPersonId },
    });
    return { studentId: data.studentId, guardianPersonId: data.guardianPersonId };
  });

export const getStudentStatusHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getStudentStatusHistoryInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    assertCanSeeStudent(await loadStudentScope(db, membership, context.userId), data.studentId);

    // 1. Procurar transições em student_status_history
    const { data: historyRows } = await db
      .from("student_status_history")
      .select("id, previous_status, new_status, reason, changed_by, created_at")
      .eq("student_id", data.studentId)
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false });

    // 2. Procurar candidatura de origem em enrollment_applications
    const { data: applications } = await db
      .from("enrollment_applications")
      .select("id, full_name, status, created_at, decided_at, decided_by")
      .eq("student_id", data.studentId)
      .eq("school_id", membership.schoolId);

    // 3. Resolver nomes de utilizadores
    const userIds = [
      ...new Set([
        ...(historyRows ?? [])
          .map((r: { changed_by: string | null }) => r.changed_by)
          .filter(Boolean),
        ...(applications ?? [])
          .map((a: { decided_by: string | null }) => a.decided_by)
          .filter(Boolean),
      ]),
    ] as string[];

    const { data: profiles } = userIds.length
      ? // `profiles` não tem `email`: a coluna vive em `people`, ligada por
        // `user_id`. Com `email` no select o PostgREST recusava tudo, e o mapa
        // de nomes ficava vazio sem que nada o dissesse.
        await db.from("people").select("user_id, full_name, email").in("user_id", userIds)
      : {
          data: [] as Array<{
            user_id: string | null;
            full_name: string | null;
            email: string | null;
          }>,
        };
    const userMap = new Map(
      (profiles ?? [])
        .filter((p) => p.user_id)
        .map((p) => [String(p.user_id), p.full_name || p.email]),
    );

    const events: Array<{
      id: string;
      previous_status: string | null;
      new_status: string;
      reason: string | null;
      changed_by_name: string | null;
      created_at: string;
      event_type: "status_change" | "candidacy" | "enrollment";
      details: string | null;
    }> = [];

    // Candidatura inicial (se houver)
    for (const app of applications ?? []) {
      events.push({
        id: `app-sub-${app.id}`,
        previous_status: null,
        new_status: "applicant",
        reason: "Candidatura institucional submetida",
        changed_by_name: null,
        created_at: app.created_at,
        event_type: "candidacy",
        details: "Submissão no portal",
      });
      if (app.decided_at && app.status === "accepted") {
        events.push({
          id: `app-dec-${app.id}`,
          previous_status: "applicant",
          new_status: "active",
          reason: "Candidatura aceite pela secretaria",
          changed_by_name: app.decided_by ? (userMap.get(app.decided_by) ?? null) : null,
          created_at: app.decided_at,
          event_type: "candidacy",
          details: "Admissão confirmada",
        });
      }
    }

    // Histórico de transições registadas
    for (const row of historyRows ?? []) {
      events.push({
        id: row.id,
        previous_status: row.previous_status,
        new_status: row.new_status,
        reason: row.reason,
        changed_by_name: row.changed_by ? (userMap.get(row.changed_by) ?? null) : null,
        created_at: row.created_at,
        event_type: "status_change",
        details: null,
      });
    }

    return events.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  });

export const batchAssignClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => batchAssignClassInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;

    const { data: group, error: groupError } = await db
      .from("class_groups")
      .select("id, name, capacity, academic_year_id")
      .eq("id", data.classGroupId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (groupError) throw publicDatabaseError(groupError, "Não foi possível abrir a turma.");
    if (!group) throw new Error("Turma não encontrada.");
    if (String(group.academic_year_id) !== data.academicYearId) {
      throw new Error("A turma não pertence ao ano lectivo indicado.");
    }

    const requested = [...new Set(data.studentIds)];
    const { data: students, error: studentsError } = await db
      .from("students")
      .select("id, status")
      .eq("school_id", schoolId)
      .in("id", requested);
    if (studentsError) throw publicDatabaseError(studentsError, "Não foi possível ler os alunos.");
    const statusById = new Map(
      (students ?? []).map((row) => [String(row.id), (row.status as string | null) ?? null]),
    );
    const failed: Array<{ studentId: string; message: string }> = requested
      .filter((id) => !statusById.has(id))
      .map((studentId) => ({ studentId, message: "Aluno não encontrado nesta escola." }));
    const knownIds = [...statusById.keys()];
    if (knownIds.length === 0)
      throw new Error("Nenhum dos alunos seleccionados pertence a esta escola.");

    // Matrícula corrente no ano (activa ou pendente — a base só admite uma).
    const { data: current, error: currentError } = await db
      .from("enrollments")
      .select("id, student_id, class_group_id, status")
      .eq("school_id", schoolId)
      .eq("academic_year_id", data.academicYearId)
      .in("status", [...CURRENT_ENROLLMENT_STATUSES])
      .in("student_id", knownIds);
    if (currentError) {
      throw publicDatabaseError(currentError, "Não foi possível verificar matrículas existentes.");
    }
    const currentRows = (current ?? []) as Array<{
      id: string;
      student_id: string;
      class_group_id: string | null;
      status: string;
    }>;
    const withCurrent = new Set(currentRows.map((row) => String(row.student_id)));
    const toMove = currentRows.filter((row) => row.class_group_id !== group.id);
    // Já nesta turma com a matrícula pendente: fica confirmada, como na colocação
    // individual (o lugar já estava ocupado, não conta para a lotação).
    const toConfirm = currentRows.filter(
      (row) => row.class_group_id === group.id && row.status === "pending",
    );
    // Suspenso e trancado sem matrícula: a mesma recusa da colocação individual.
    const toEnroll: string[] = [];
    for (const studentId of knownIds.filter((id) => !withCurrent.has(id))) {
      const held = heldStudentMessage(statusById.get(studentId));
      if (held) failed.push({ studentId, message: held });
      else toEnroll.push(studentId);
    }
    // A matrícula nova exige 2FA na base: recusado antes de mexer em qualquer aluno.
    if (toEnroll.length && context.claims?.["aal"] !== "aal2") {
      throw new Error(ENROLLMENT_2FA_MESSAGE);
    }

    // Capacidade: tudo ou nada, antes de mexer em qualquer matrícula.
    const capacity = typeof group.capacity === "number" ? group.capacity : null;
    if (capacity && capacity > 0) {
      const { count, error: countError } = await db
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("class_group_id", group.id)
        .in("status", [...CURRENT_ENROLLMENT_STATUSES]);
      if (countError) throw publicDatabaseError(countError, "Não foi possível ler a lotação.");
      const free = capacity - (count ?? 0);
      const incoming = toMove.length + toEnroll.length;
      if (incoming > free) {
        throw new Error(
          `A turma ${group.name} tem ${Math.max(free, 0)} lugar(es) livre(s) e seleccionou ${incoming} aluno(s) a entrar.`,
        );
      }
    }

    const enrolled = new Set(
      currentRows.filter((row) => row.class_group_id === group.id).map((row) => row.student_id),
    );

    if (toMove.length) {
      const { error: moveError } = await db
        .from("enrollments")
        .update({ class_group_id: group.id, status: "active", updated_by: context.userId })
        .eq("school_id", schoolId)
        .in(
          "id",
          toMove.map((row) => row.id),
        );
      if (moveError)
        throw publicDatabaseError(moveError, "Não foi possível mudar os alunos de turma.");
      for (const row of toMove) enrolled.add(String(row.student_id));
    }
    if (toConfirm.length) {
      const { error: confirmError } = await db
        .from("enrollments")
        .update({ status: "active", updated_by: context.userId })
        .eq("school_id", schoolId)
        .in(
          "id",
          toConfirm.map((row) => row.id),
        );
      if (confirmError) {
        throw publicDatabaseError(confirmError, "Não foi possível confirmar as matrículas.");
      }
    }

    // Quem tinha saído (anulado, desistente…) volta a candidato para enroll_student o aceitar.
    const returning = toEnroll.filter((id) =>
      (RETURNING_STUDENT_STATUSES as readonly string[]).includes(statusById.get(id) ?? ""),
    );
    await reopenReturningStudents(db, {
      schoolId,
      studentIds: returning,
      userId: context.userId,
    });

    // Matrículas novas pela mesma função que a matrícula individual. Em série,
    // porque cada chamada tranca a mesma turma.
    const enrolledOn = schoolTodayIso();
    const toRestore: Array<{ studentId: string; status: string }> = [];
    for (const studentId of toEnroll) {
      const outcome = await enrollStudentRpc(context.supabase, {
        schoolId,
        studentId,
        classGroupId: group.id,
        enrolledOn,
      });
      if (outcome.ok) {
        enrolled.add(studentId);
        continue;
      }
      const previous = statusById.get(studentId);
      if (previous && returning.includes(studentId))
        toRestore.push({ studentId, status: previous });
      failed.push({
        studentId,
        message: rpcFailureError(outcome, { fallback: "Não foi possível matricular o aluno." })
          .message,
      });
    }
    await restoreStudentStatuses(db, { schoolId, students: toRestore, userId: context.userId });

    await syncStudentStatusAfterPlacement(db, {
      schoolId,
      students: [...enrolled].map((studentId) => ({
        studentId,
        previousStatus: statusById.get(studentId) ?? null,
      })),
      reason: "Colocado em turma (em lote)",
      userId: context.userId,
    });

    queueTenantUsageSync(schoolId);
    return { success: failed.length === 0, count: enrolled.size, className: group.name, failed };
  });

export const batchUpdateStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => batchUpdateStudentStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: students, error: readError } = await db
      .from("students")
      .select("id, status")
      .in("id", data.studentIds)
      .eq("school_id", membership.schoolId);
    if (readError) throw publicDatabaseError(readError, "Não foi possível ler os alunos.");

    // Quem já está no estado pedido fica igual: sem escrita nem histórico.
    const changes = ((students ?? []) as Array<{ id: string; status: string | null }>).filter(
      (s) => s.status !== data.newStatus,
    );
    const updatedIds = changes.map((s) => s.id);
    if (updatedIds.length) {
      // Uma escrita para o lote, com erro verificado (antes era uma por aluno e
      // as falhas passavam: o ecrã dizia "actualizado" sem ter mudado).
      const { error: updateError } = await db
        .from("students")
        .update({ status: data.newStatus, updated_by: context.userId })
        .in("id", updatedIds)
        .eq("school_id", membership.schoolId);
      if (updateError) {
        throw publicDatabaseError(updateError, "Não foi possível alterar o estado dos alunos.");
      }
      const reason = data.reason || "Atualização em lote";
      await closeCurrentEnrollmentsForStatus(db, {
        schoolId: membership.schoolId,
        studentIds: updatedIds,
        studentStatus: data.newStatus,
        reason: data.reason,
        userId: context.userId,
      });
      await recordStudentStatusHistoryBatch(db, {
        schoolId: membership.schoolId,
        changes: changes.map((s) => ({ studentId: s.id, previousStatus: s.status })),
        newStatus: data.newStatus,
        reason,
        changedBy: context.userId,
      });
      // O mesmo rasto que a mudança individual (`changeStudentStatus`).
      await recordAuditBatch(
        changes.map((s) => ({
          schoolId: membership.schoolId,
          actorUserId: context.userId,
          action: "student.status_change",
          entityType: "student",
          entityId: s.id,
          metadata: {
            reason,
            batch: true,
            before: { status: s.status },
            after: { status: data.newStatus },
          },
        })),
      );
    }

    queueTenantUsageSync(membership.schoolId);
    return { success: true, count: updatedIds.length, status: data.newStatus };
  });
