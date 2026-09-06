import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  assignGuardianInputSchema,
  cancelEnrollmentInputSchema,
  changeStudentStatusInputSchema,
  getStudentInputSchema,
  listEnrollmentsInputSchema,
  removeGuardianInputSchema,
  searchStudentsInputSchema,
  updateEnrollmentAttendanceInputSchema,
  updateEnrollmentInputSchema,
  updateStudentProfileInputSchema,
  enrollStudentInClassInputSchema,
} from "./schemas";
import * as legacy from "./server";

// Preserve the existing API. Explicit exports below override sensitive reads/writes
// for every @/.../students/server import through the exact tsconfig path alias.
export * from "./server";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

async function requireAcademicWriter(userId: string) {
  const db = await loadSgaAdminClient();
  // requireSgaWriter resolves the membership using the same service-role source of truth.
  const membership = await requireSgaWriter(db, userId, ["Administrador", "Secretaria"]);
  return { db, membership };
}

async function assertStudentInSchool(db: Db, schoolId: string, studentId: string) {
  const { data, error } = await db
    .from("students")
    .select("id, person_id")
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o aluno.");
  if (!data?.id) throw new Error("Aluno não encontrado nesta escola.");
  return data;
}

async function assertPersonInSchool(db: Db, schoolId: string, personId: string) {
  const { data, error } = await db
    .from("people")
    .select("id")
    .eq("id", personId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar a Pessoa.");
  if (!data?.id) throw new Error("Pessoa não encontrada nesta escola.");
}

async function assertClassAndYearInSchool(params: {
  db: Db;
  schoolId: string;
  classGroupId: string;
  academicYearId: string;
}) {
  const [{ data: group, error: groupError }, { data: year, error: yearError }] = await Promise.all([
    params.db
      .from("class_groups")
      .select("id, academic_year_id")
      .eq("id", params.classGroupId)
      .eq("school_id", params.schoolId)
      .maybeSingle(),
    params.db
      .from("academic_years")
      .select("id")
      .eq("id", params.academicYearId)
      .eq("school_id", params.schoolId)
      .maybeSingle(),
  ]);
  if (groupError) throw publicDatabaseError(groupError, "Não foi possível validar a turma.");
  if (yearError) throw publicDatabaseError(yearError, "Não foi possível validar o ano lectivo.");
  if (!group?.id) throw new Error("Turma não encontrada nesta escola.");
  if (!year?.id) throw new Error("Ano lectivo não encontrado nesta escola.");
  if (group.academic_year_id && String(group.academic_year_id) !== params.academicYearId) {
    throw new Error("A turma seleccionada não pertence ao ano lectivo informado.");
  }
}

async function loadEnrollmentInSchool(db: Db, schoolId: string, enrollmentId: string) {
  const { data, error } = await db
    .from("enrollments")
    .select("id, student_id, class_group_id, academic_year_id, status")
    .eq("id", enrollmentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar a matrícula.");
  if (!data?.id) throw new Error("Matrícula não encontrada nesta escola.");
  return data;
}

async function resolveContextualStudentIds(params: {
  schoolId: string;
  userId: string;
  appRole: string;
}): Promise<Set<string> | null> {
  if (params.appRole === "Administrador" || params.appRole === "Secretaria") {
    return null;
  }

  const db = await loadSgaAdminClient();

  if (params.appRole === "Aluno") {
    const { data: people, error: peopleError } = await db
      .from("people")
      .select("id")
      .eq("school_id", params.schoolId)
      .eq("user_id", params.userId);
    if (peopleError) {
      throw publicDatabaseError(peopleError, "Não foi possível validar o perfil do aluno.");
    }
    const personIds = (people ?? []).map((row) => String(row.id));
    if (!personIds.length) return new Set();

    const { data: students, error: studentsError } = await db
      .from("students")
      .select("id")
      .eq("school_id", params.schoolId)
      .in("person_id", personIds);
    if (studentsError) {
      throw publicDatabaseError(studentsError, "Não foi possível validar o aluno da conta.");
    }
    return new Set((students ?? []).map((row) => String(row.id)));
  }

  if (params.appRole === "Encarregado") {
    const { data: people, error: peopleError } = await db
      .from("people")
      .select("id")
      .eq("school_id", params.schoolId)
      .eq("user_id", params.userId);
    if (peopleError) {
      throw publicDatabaseError(peopleError, "Não foi possível validar o encarregado.");
    }
    const guardianPersonIds = (people ?? []).map((row) => String(row.id));
    if (!guardianPersonIds.length) return new Set();

    const { data: links, error: linksError } = await db
      .from("student_guardians")
      .select("student_id")
      .eq("school_id", params.schoolId)
      .in("guardian_person_id", guardianPersonIds);
    if (linksError) {
      throw publicDatabaseError(linksError, "Não foi possível validar os educandos vinculados.");
    }
    return new Set((links ?? []).map((row) => String(row.student_id)));
  }

  throw new Error("Este perfil não tem acesso ao directório pessoal de alunos.");
}

export const searchStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchStudentsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    const allowedIds = await resolveContextualStudentIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });

    if (allowedIds === null) return legacy.searchStudents({ data });
    if (allowedIds.size === 0) return [];

    const candidates = await legacy.searchStudents({
      data: { query: data.query, limit: 100, offset: 0 },
    });
    const authorized = candidates.filter((row) => allowedIds.has(String(row.id)));
    return authorized.slice(data.offset, data.offset + data.limit);
  });

export const getStudentProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getStudentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    const allowedIds = await resolveContextualStudentIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });
    if (allowedIds !== null && !allowedIds.has(data.id)) {
      throw new Error("Não tem autorização para consultar este aluno.");
    }
    return legacy.getStudentProfile({ data });
  });

export const listEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listEnrollmentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    const allowedIds = await resolveContextualStudentIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });
    if (allowedIds === null) return legacy.listEnrollments({ data });
    if (!allowedIds.size) return [];

    const rows = await legacy.listEnrollments({ data: { ...data, limit: 250 } });
    return rows.filter((row) => allowedIds.has(String(row.student_id))).slice(0, data.limit);
  });

export const enrollStudentInClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => enrollStudentInClassInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);
    await assertStudentInSchool(db, membership.schoolId, data.studentId);
    await assertClassAndYearInSchool({
      db,
      schoolId: membership.schoolId,
      classGroupId: data.classGroupId,
      academicYearId: data.academicYearId,
    });
    return legacy.enrollStudentInClass({ data });
  });

export const updateEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateEnrollmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);
    const enrollment = await loadEnrollmentInSchool(db, membership.schoolId, data.enrollmentId);
    const academicYearId = String(enrollment.academic_year_id ?? "");
    if (!academicYearId) throw new Error("A matrícula não possui ano lectivo válido.");
    await assertClassAndYearInSchool({
      db,
      schoolId: membership.schoolId,
      classGroupId: data.classGroupId,
      academicYearId,
    });
    return legacy.updateEnrollment({ data });
  });

export const cancelEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancelEnrollmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);
    await loadEnrollmentInSchool(db, membership.schoolId, data.enrollmentId);
    return legacy.cancelEnrollment({ data });
  });

export const updateEnrollmentAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateEnrollmentAttendanceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);
    await loadEnrollmentInSchool(db, membership.schoolId, data.enrollmentId);
    return legacy.updateEnrollmentAttendance({ data });
  });

export const assignGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignGuardianInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);
    await Promise.all([
      assertStudentInSchool(db, membership.schoolId, data.studentId),
      assertPersonInSchool(db, membership.schoolId, data.guardianPersonId),
    ]);
    return legacy.assignGuardian({ data });
  });

export const removeGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => removeGuardianInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);
    await Promise.all([
      assertStudentInSchool(db, membership.schoolId, data.studentId),
      assertPersonInSchool(db, membership.schoolId, data.guardianPersonId),
    ]);
    return legacy.removeGuardian({ data });
  });

export const changeStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => changeStudentStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);
    await assertStudentInSchool(db, membership.schoolId, data.studentId);
    return legacy.changeStudentStatus({ data });
  });

export const updateStudentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateStudentProfileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);
    await assertPersonInSchool(db, membership.schoolId, data.personId);
    return legacy.updateStudentProfile({ data });
  });
