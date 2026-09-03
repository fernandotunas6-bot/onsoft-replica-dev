import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  cancelEnrollmentInputSchema,
  changeStudentStatusInputSchema,
  createStudentInputSchema,
  enrollNewStudentInputSchema,
  enrollStudentInClassInputSchema,
  getStudentInputSchema,
  assignGuardianInputSchema,
  mapSgaGuardianRelationship,
  listEnrollmentsInputSchema,
  removeGuardianInputSchema,
  searchStudentsInputSchema,
  updateEnrollmentAttendanceInputSchema,
  updateEnrollmentInputSchema,
  updateStudentProfileInputSchema,
} from "./schemas";
import { queueTenantUsageSync } from "@/features/saas/usage-sync";
import { assertCanAddStudentForSchool } from "@/features/saas/tenant-limits-server";

function isMissingPeopleGeography(error: { message?: string; code?: string } | null | undefined) {
  return Boolean(
    error &&
      (/province|municipality|commune|address|42703|schema cache/i.test(error.message ?? "") ||
        error.code === "42703"),
  );
}

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
    await db
      .from("student_guardians")
      .update({ is_primary: false })
      .eq("school_id", input.schoolId)
      .eq("student_id", input.studentId)
      .eq("is_primary", true);
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
};

export const searchStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchStudentsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: students, error } = await db
      .from("students")
      .select("id, student_number, status, person_id, school_id, admission_date")
      .eq("school_id", membership.schoolId)
      .order("student_number")
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw publicDatabaseError(error, "Não foi possível pesquisar os alunos.");

    const rows = students ?? [];
    const personIds = [...new Set(rows.map((row: { person_id: string }) => row.person_id))];
    const studentIds = rows.map((row: { id: string }) => row.id);

    const [{ data: people }, { data: enrollments }, { data: guardians }] = await Promise.all([
      personIds.length
        ? db
            .from("people")
            .select("id, full_name, email, phone, photo_url")
            .eq("school_id", membership.schoolId)
            .in("id", personIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              full_name: string;
              email: string | null;
              phone: string | null;
              photo_url?: string | null;
            }>,
          }),
      studentIds.length
        ? db
            .from("enrollments")
            .select("student_id, class_group_id, academic_year_id, status")
            .in("student_id", studentIds)
            .eq("school_id", membership.schoolId)
            .eq("status", "active")
        : Promise.resolve({
            data: [] as Array<{
              student_id: string;
              class_group_id: string | null;
              academic_year_id: string | null;
              status: string;
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

    const peopleById = new Map(
      (people ?? []).map((person: { id: string }) => [
        person.id,
        person as Record<string, unknown>,
      ]),
    );
    const classGroupIds = [
      ...new Set(
        (enrollments ?? [])
          .map((row: { class_group_id: string | null }) => row.class_group_id)
          .filter(Boolean),
      ),
    ] as string[];
    const yearIds = [
      ...new Set(
        (enrollments ?? [])
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
    const enrollmentByStudent = new Map(
      (enrollments ?? []).map((row: { student_id: string }) => [
        row.student_id,
        row as Record<string, unknown>,
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
        const effectiveStatus =
          enrollmentStatus === "active" && student.status === "applicant"
            ? "active"
            : student.status;
        return {
          id: student.id,
          registration_number: student.student_number,
          full_name: String(person?.["full_name"] ?? "—"),
          email: (person?.["email"] as string | null) ?? null,
          phone: (person?.["phone"] as string | null) ?? null,
          photo_url: (person?.["photo_url"] as string | null) ?? null,
          // Matrícula activa no SGA implica aluno activo na UI, mesmo se o
          // registo ainda estiver como "applicant" por seed/legado.
          student_status: effectiveStatus,
          payment_status: null,
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

    const staleApplicantIds = rows
      .filter((student: { id: string; status: string }) => {
        const enrollment = enrollmentByStudent.get(student.id);
        return student.status === "applicant" && String(enrollment?.["status"] ?? "") === "active";
      })
      .map((student: { id: string }) => student.id);
    if (staleApplicantIds.length) {
      await db
        .from("students")
        .update({ status: "active" })
        .eq("school_id", membership.schoolId)
        .in("id", staleApplicantIds);
    }

    if (!query) return mapped;
    return mapped.filter(
      (row) =>
        row.full_name.toLowerCase().includes(query) ||
        row.registration_number.toLowerCase().includes(query) ||
        (row.email ?? "").toLowerCase().includes(query) ||
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
          "id, full_name, preferred_name, email, phone, date_of_birth, sex, national_id, status, photo_url",
        )
        .eq("id", student.person_id)
        .eq("school_id", membership.schoolId)
        .maybeSingle()
        .then(async (result) => {
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
      db
        .from("enrollments")
        .select(
          "id, class_group_id, academic_year_id, status, enrolled_on, attendance_rate, final_average",
        )
        .eq("student_id", student.id)
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);
    const person = personResult.data as {
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
      sex?: string | null;
      date_of_birth?: string | null;
      photo_url?: string | null;
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
        .eq("status", "active")
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
        address: null,
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

export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createStudentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    await assertCanAddStudentForSchool(membership.schoolId);

    // register_student cria o aluno numa transação atómica
    const firstGuardian = (data.guardians ?? [])[0];
    const { data: registered, error: registerError } = await context.supabase.rpc(
      "register_student",
      {
        school_id: membership.schoolId,
        person_id: data.personId,
        admission_date: data.admittedOn ?? new Date().toISOString().slice(0, 10),
        guardian_person_id: firstGuardian?.guardian_person_id ?? null,
        relationship: firstGuardian ? mapSgaGuardianRelationship(firstGuardian.relationship) : null,
        primary_guardian: firstGuardian?.is_primary ?? false,
        financial_responsibility: firstGuardian?.is_primary ?? false,
        pickup_authorization: firstGuardian?.authorized_pickup ?? true,
      },
    );
    if (registerError) {
      if (rpcAuthError(registerError)) {
        throw new Error(
          "Esta conta precisa de verificação em duas etapas (2FA) activa para criar alunos.",
        );
      }
      throw publicDatabaseError(registerError, "Não foi possível criar o aluno.");
    }
    const studentOutcome = registered as {
      studentId: string;
      studentNumber: string;
      status: string;
    };

    for (const guardian of (data.guardians ?? []).slice(1)) {
      await linkGuardian(db, {
        schoolId: membership.schoolId,
        studentId: studentOutcome.studentId,
        guardianPersonId: guardian.guardian_person_id,
        relationship: guardian.relationship,
        isPrimary: guardian.is_primary,
        userId: context.userId,
      });
    }

    let enrollmentOutcome: { enrollmentId: string; enrollmentNumber: string } | null = null;
    if (data.classGroupId && data.academicYearId) {
      const { data: enrolled, error: enrollError } = await context.supabase.rpc("enroll_student", {
        school_id: membership.schoolId,
        student_id: studentOutcome.studentId,
        class_group_id: data.classGroupId,
        enrolled_on: data.admittedOn ?? new Date().toISOString().slice(0, 10),
      });
      if (enrollError) {
        if (rpcAuthError(enrollError)) {
          throw new Error(
            "Aluno criado, mas esta conta precisa de 2FA activo para o matricular numa turma.",
          );
        }
        throw publicDatabaseError(enrollError, "Aluno criado, mas falhou a matrícula na turma.");
      }
      enrollmentOutcome = enrolled as { enrollmentId: string; enrollmentNumber: string };
    }

    queueTenantUsageSync(membership.schoolId);

    return {
      id: studentOutcome.studentId,
      student_number: studentOutcome.studentNumber,
      status: enrollmentOutcome ? "active" : studentOutcome.status,
      person_id: data.personId,
      enrollment_number: enrollmentOutcome?.enrollmentNumber ?? null,
    };
  });

function rpcAuthError(error: { code?: string; message?: string }) {
  return error.code === "42501" || /is_aal2|autorização|autorizacao/i.test(error.message ?? "");
}

export const enrollNewStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => enrollNewStudentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    await assertCanAddStudentForSchool(membership.schoolId);

    const personInput = data.person;
    const fullName = personInput.full_name.trim();
    if (!fullName) throw new Error("Nome do aluno é obrigatório.");

    const personPayload: Record<string, unknown> = {
      school_id: membership.schoolId,
      full_name: fullName,
      preferred_name:
        personInput.preferred_name || personInput.first_name || fullName.split(/\s+/)[0],
      email: personInput.email || null,
      phone: personInput.phone_primary || null,
      national_id: personInput.nif || null,
      date_of_birth: personInput.birth_date || null,
      sex:
        personInput.sex === "M"
          ? "male"
          : personInput.sex === "F"
            ? "female"
            : personInput.sex || null,
      status: "active",
      created_by: context.userId,
      updated_by: context.userId,
    };
    const hasGeography = Boolean(
      personInput.province ||
        personInput.municipality ||
        personInput.commune ||
        personInput.address,
    );
    if (hasGeography) {
      personPayload["province"] = personInput.province || null;
      personPayload["municipality"] = personInput.municipality || null;
      personPayload["commune"] = personInput.commune || null;
      personPayload["address"] = personInput.address || null;
    }

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

    // register_student cria o aluno (+ 1º encarregado) numa transação atómica: gera o
    // número de processo por sequência própria (nunca duplica sob pedidos simultâneos,
    // ao contrário do insert directo anterior) e valida a pessoa/encarregado antes de gravar.
    const firstGuardian = (data.guardians ?? [])[0];
    const { data: registered, error: registerError } = await context.supabase.rpc(
      "register_student",
      {
        school_id: membership.schoolId,
        person_id: person.id,
        admission_date: data.admittedOn ?? new Date().toISOString().slice(0, 10),
        guardian_person_id: firstGuardian?.guardian_person_id ?? null,
        relationship: firstGuardian ? mapSgaGuardianRelationship(firstGuardian.relationship) : null,
        primary_guardian: firstGuardian?.is_primary ?? false,
        financial_responsibility: firstGuardian?.is_primary ?? false,
        pickup_authorization: firstGuardian?.authorized_pickup ?? true,
      },
    );
    if (registerError) {
      if (rpcAuthError(registerError)) {
        throw new Error(
          "Esta conta precisa de verificação em duas etapas (2FA) activa para matricular alunos.",
        );
      }
      throw publicDatabaseError(registerError, "Não foi possível concluir a matrícula.");
    }
    const studentOutcome = registered as {
      studentId: string;
      studentNumber: string;
      status: string;
    };

    // Restantes encarregados (2º em diante) — relação secundária, sem o mesmo risco de
    // corrida do registo principal, mantida como antes.
    for (const guardian of (data.guardians ?? []).slice(1)) {
      await linkGuardian(db, {
        schoolId: membership.schoolId,
        studentId: studentOutcome.studentId,
        guardianPersonId: guardian.guardian_person_id,
        relationship: guardian.relationship,
        isPrimary: guardian.is_primary,
        userId: context.userId,
      });
    }

    let enrollmentOutcome: { enrollmentId: string; enrollmentNumber: string } | null = null;
    if (data.classGroupId && data.academicYearId) {
      const { data: enrolled, error: enrollError } = await context.supabase.rpc("enroll_student", {
        school_id: membership.schoolId,
        student_id: studentOutcome.studentId,
        class_group_id: data.classGroupId,
        enrolled_on: data.admittedOn ?? new Date().toISOString().slice(0, 10),
      });
      if (enrollError) {
        if (rpcAuthError(enrollError)) {
          throw new Error(
            "Aluno criado, mas esta conta precisa de 2FA activo para o matricular numa turma.",
          );
        }
        throw publicDatabaseError(enrollError, "Aluno criado, mas falhou a matrícula na turma.");
      }
      enrollmentOutcome = enrolled as { enrollmentId: string; enrollmentNumber: string };
    }

    queueTenantUsageSync(membership.schoolId);

    return {
      id: studentOutcome.studentId,
      student_number: studentOutcome.studentNumber,
      status: enrollmentOutcome ? "active" : studentOutcome.status,
      person_id: person.id,
      enrollment_number: enrollmentOutcome?.enrollmentNumber ?? null,
    };
  });

export const changeStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => changeStudentStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
    const { data: student, error } = await db
      .from("students")
      .update({ status: nextStatus, updated_by: context.userId })
      .eq("id", data.studentId)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível alterar o estado do aluno.");
    if (!student) throw new Error("Aluno não encontrado");
    queueTenantUsageSync(membership.schoolId);
    return student;
  });

export const updateStudentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateStudentProfileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const personPatch: Record<string, unknown> = {
      full_name: data.fullName,
      email: data.email || null,
      phone: data.phone ?? null,
      updated_by: context.userId,
    };
    const hasGeography = Boolean(data.province || data.municipality || data.commune || data.address);
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

export const enrollStudentInClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => enrollStudentInClassInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: existing, error: existingError } = await db
      .from("enrollments")
      .select("id, status")
      .eq("student_id", data.studentId)
      .eq("academic_year_id", data.academicYearId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (existingError) {
      throw publicDatabaseError(existingError, "Não foi possível verificar matrículas existentes.");
    }

    if (existing) {
      const { data: updated, error } = await db
        .from("enrollments")
        .update({
          class_group_id: data.classGroupId,
          status: "active",
          updated_by: context.userId,
        })
        .eq("id", existing.id)
        .eq("school_id", membership.schoolId)
        .select("*")
        .single();
      if (error)
        throw publicDatabaseError(error, "Não foi possível actualizar a matrícula na turma.");
      await db
        .from("students")
        .update({ status: "active", updated_by: context.userId })
        .eq("id", data.studentId)
        .eq("school_id", membership.schoolId);
      return updated;
    }

    // enroll_student tranca a turma (FOR UPDATE), valida capacidade/ano lectivo/estado
    // do aluno e gera o número de matrícula atomicamente — substitui o insert directo
    // que não protegia contra duas matrículas simultâneas excederem a capacidade da turma.
    const { data: enrolled, error } = await context.supabase.rpc("enroll_student", {
      school_id: membership.schoolId,
      student_id: data.studentId,
      class_group_id: data.classGroupId,
      enrolled_on: data.enrolledOn ?? new Date().toISOString().slice(0, 10),
    });
    if (error) {
      if (rpcAuthError(error)) {
        throw new Error(
          "Esta conta precisa de verificação em duas etapas (2FA) activa para matricular alunos.",
        );
      }
      throw publicDatabaseError(error, "Não foi possível matricular o aluno na turma.");
    }
    const outcome = enrolled as {
      enrollmentId: string;
      enrollmentNumber: string;
      classGroupId: string;
      status: string;
    };
    return {
      id: outcome.enrollmentId,
      enrollment_number: outcome.enrollmentNumber,
      class_group_id: outcome.classGroupId,
      student_id: data.studentId,
      academic_year_id: data.academicYearId,
      status: outcome.status,
    };
  });

export const listEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listEnrollmentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

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

    const { data: enrollments, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as matrículas.");

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

export const updateEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateEnrollmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: classGroup, error: classError } = await db
      .from("class_groups")
      .select("id, academic_year_id, school_id")
      .eq("id", data.classGroupId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (classError) throw publicDatabaseError(classError, "Não foi possível validar a turma.");
    if (!classGroup) throw new Error("Turma não encontrada nesta escola.");

    const patch: Record<string, unknown> = {
      class_group_id: data.classGroupId,
      status: data.status,
      updated_by: context.userId,
    };
    if (classGroup["academic_year_id"]) {
      patch["academic_year_id"] = classGroup["academic_year_id"];
    }

    const { data: enrollment, error } = await db
      .from("enrollments")
      .update(patch)
      .eq("id", data.enrollmentId)
      .eq("school_id", membership.schoolId)
      .select("*")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a matrícula.");
    if (!enrollment) throw new Error("Matrícula não encontrada.");
    return enrollment;
  });

export const updateEnrollmentAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateEnrollmentAttendanceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    let { data: enrollment, error } = await db
      .from("enrollments")
      .update({
        status: "withdrawn",
        updated_by: context.userId,
      })
      .eq("id", data.enrollmentId)
      .eq("school_id", membership.schoolId)
      .select("id, status, student_id")
      .maybeSingle();
    if (error && /status|check/i.test(error.message)) {
      const retry = await db
        .from("enrollments")
        .update({
          status: "inactive",
          updated_by: context.userId,
        })
        .eq("id", data.enrollmentId)
        .eq("school_id", membership.schoolId)
        .select("id, status, student_id")
        .maybeSingle();
      enrollment = retry.data;
      error = retry.error;
    }
    if (error) throw publicDatabaseError(error, "Não foi possível anular a matrícula.");
    if (!enrollment) throw new Error("Matrícula não encontrada.");
    void data.reason;
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
    return { studentId: data.studentId, guardianPersonId: data.guardianPersonId };
  });

export const removeGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => removeGuardianInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
    return { studentId: data.studentId, guardianPersonId: data.guardianPersonId };
  });
