import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { pedagogySettingsSchema } from "@/features/school/schemas";
import { averagePercent } from "@/features/students/schemas";
import { loadPeopleLite, loadPersonNamesById } from "@/features/people/lookup";
import {
  ensureDefaultTeacher,
  listSgaTermGrades,
  upsertSgaTermGrade,
  upsertSgaTermGradesBatch,
} from "./sga-grades";
import {
  createClassGroupInputSchema,
  createScheduleSlotInputSchema,
  deleteScheduleSlotInputSchema,
  updateScheduleSlotInputSchema,
  createSubjectInputSchema,
  updateSubjectInputSchema,
  deactivateSubjectInputSchema,
  deleteClassGroupInputSchema,
  ensureAcademicDefaultsInputSchema,
  listPedagogicalWorkspaceInputSchema,
  listTermGradesInputSchema,
  getTeacherWorkspaceInputSchema,
  updateClassGroupInputSchema,
  upsertTermGradeInputSchema,
  upsertTermGradesBatchInputSchema,
  createAssessmentInputSchema,
  updateAssessmentInputSchema,
  deleteAssessmentInputSchema,
  listAssessmentsInputSchema,
  upsertAssessmentScoresInputSchema,
  assignClassSubjectTeacherInputSchema,
  unassignClassSubjectTeacherInputSchema,
} from "./schemas";

function scoreAverage(mac: number, npp: number, npt: number) {
  return (mac + npp + npt) / 3;
}

async function assertTermOpen(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  term: number,
) {
  const { data } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", "pedagogy")
    .maybeSingle();
  const pedagogy = pedagogySettingsSchema.safeParse(data?.value ?? {}).data;
  if (pedagogy?.closedTerms.includes(term as 1 | 2 | 3)) {
    throw new Error(
      `O ${term}º trimestre está fechado. O director pode reabrir a pauta em Configurações → Pedagógico.`,
    );
  }
}

function scheduleTime(value: unknown) {
  return String(value ?? "").slice(0, 5);
}

function scheduleTimesOverlap(
  startsAt: string,
  endsAt: string,
  otherStartsAt: unknown,
  otherEndsAt: unknown,
) {
  return startsAt < scheduleTime(otherEndsAt) && endsAt > scheduleTime(otherStartsAt);
}

async function assertScheduleSlotAvailable({
  db,
  schoolId,
  classGroupId,
  teacherId,
  weekday,
  startsAt,
  endsAt,
  room,
  excludeSlotId,
}: {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  classGroupId: string;
  teacherId: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string;
  excludeSlotId?: string;
}) {
  let query = db
    .from("timetable_slots")
    .select("id, class_subject_id, starts_at, ends_at, room")
    .eq("school_id", schoolId)
    .eq("weekday", weekday)
    .eq("status", "active");
  if (excludeSlotId) query = query.neq("id", excludeSlotId);
  const { data: candidateSlots, error: slotsError } = await query;
  if (slotsError) {
    throw publicDatabaseError(slotsError, "Não foi possível validar conflitos de horário.");
  }

  const overlappingSlots = (candidateSlots ?? []).filter((slot) =>
    scheduleTimesOverlap(startsAt, endsAt, slot.starts_at, slot.ends_at),
  );
  if (overlappingSlots.length === 0) return;

  const relatedClassSubjectIds = [
    ...new Set(overlappingSlots.map((slot) => String(slot.class_subject_id))),
  ];
  const { data: relatedClassSubjects, error: subjectsError } = await db
    .from("class_subjects")
    .select("id, class_group_id, teacher_id")
    .eq("school_id", schoolId)
    .in("id", relatedClassSubjectIds);
  if (subjectsError) {
    throw publicDatabaseError(subjectsError, "Não foi possível validar conflitos de horário.");
  }
  const subjectById = new Map(
    (relatedClassSubjects ?? []).map((subject) => [String(subject.id), subject]),
  );

  for (const slot of overlappingSlots) {
    const related = subjectById.get(String(slot.class_subject_id));
    if (String(related?.class_group_id ?? "") === classGroupId) {
      throw new Error("Esta turma já possui uma aula nesse período.");
    }
    if (teacherId && String(related?.teacher_id ?? "") === teacherId) {
      throw new Error("O professor já possui uma aula nesse período.");
    }
    if (
      String(slot.room ?? "")
        .trim()
        .toLocaleLowerCase() === room.trim().toLocaleLowerCase()
    ) {
      throw new Error("A sala já está ocupada nesse período.");
    }
  }
}

type StructureSummary = {
  id: string;
  name: string;
  code: string;
};

type ClassGroupSummary = {
  id: string;
  academic_year_id: string | null;
  name: string;
  code: string;
  shift: string;
  status: string;
  campus_id: string | null;
  capacity: number | null;
  whatsapp_invite_url: string | null;
  whatsapp_group_name: string | null;
  course_id: string | null;
  course_name: string;
  grade_name: string;
  room_name: string;
  academic_year_name: string;
  enrolled_count: number;
  average_score: number | null;
  attendance_rate: number | null;
};

type SubjectSummary = {
  id: string;
  name: string;
  code: string;
  teacher_name: string | null;
  weekly_hours: number;
  grade_from: number | null;
  grade_to: number | null;
  classes_label: string;
  weekly_hours_label: string;
  approval_rate: number | null;
};

type TermGradeSummary = {
  id: string;
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number;
  npp: number;
  npt: number;
  average: number;
  student_id: string | null;
  student_name: string;
  student_photo_url: string | null;
  registration_number: string | null;
  class_group_id: string | null;
  class_group_name: string;
  subject_name: string;
  term_label: string;
  updated_at: string;
};

type EnrollmentOptionSummary = {
  id: string;
  label: string;
  student_id: string | null;
  student_name: string;
  student_photo_url: string | null;
  registration_number: string | null;
  class_group_id: string | null;
  class_group_name: string;
};

export type ScheduleSlotSummary = {
  id: string;
  class_group_id: string | null;
  weekday: number;
  starts_at: string;
  ends_at: string;
  subject_id: string | null;
  teacher_id: string | null;
  label: string | null;
  subject_name: string | null;
  display_label: string;
  class_group_name: string;
};

type ClassSubjectNav = {
  class_group_id: string;
  subject_id: string;
  subject_name: string;
  teacher_id: string | null;
};

export type PedagogicalWorkspace = {
  academicYears: StructureSummary[];
  courses: StructureSummary[];
  gradeLevels: StructureSummary[];
  rooms: StructureSummary[];
  classGroups: ClassGroupSummary[];
  subjects: SubjectSummary[];
  classSubjects: ClassSubjectNav[];
  termGrades: TermGradeSummary[];
  enrollmentOptions: EnrollmentOptionSummary[];
  scheduleSlots: ScheduleSlotSummary[];
  subjectsAvailable: boolean;
  gradesAvailable: boolean;
  scheduleAvailable: boolean;
};

function toStructureSummary(row: Record<string, unknown>): StructureSummary {
  return {
    id: String(row["id"] ?? ""),
    name: String(row["name"] ?? ""),
    code: String(row["code"] ?? row["name"] ?? ""),
  };
}

export const listPedagogicalWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listPedagogicalWorkspaceInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PedagogicalWorkspace> => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    // Leituras académicas via admin: várias tabelas SGA não têm GRANT/RLS para authenticated.
    const db = await loadSgaAdminClient();

    const yearFilter = data.academicYearId;
    let groupsQuery = db
      .from("class_groups")
      .select("*")
      .eq("school_id", membership.schoolId)
      .order("name");
    if (yearFilter) groupsQuery = groupsQuery.eq("academic_year_id", yearFilter);

    const [years, programs, grades, campuses, groups, subjects] = await Promise.all([
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
      db
        .from("campuses")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("is_active", true)
        .order("name"),
      groupsQuery,
      db
        .from("subjects")
        .select("*")
        .eq("school_id", membership.schoolId)
        .neq("status", "inactive")
        .order("name"),
    ]);

    if (years.error)
      throw publicDatabaseError(years.error, "Não foi possível carregar os anos lectivos.");
    if (programs.error)
      throw publicDatabaseError(programs.error, "Não foi possível carregar os cursos.");
    if (grades.error)
      throw publicDatabaseError(grades.error, "Não foi possível carregar as classes.");
    if (campuses.error)
      throw publicDatabaseError(campuses.error, "Não foi possível carregar os campi.");
    if (groups.error)
      throw publicDatabaseError(groups.error, "Não foi possível carregar as turmas.");

    const subjectsMissing = Boolean(subjects.error);
    const filteredGroupIds = (groups.data ?? []).map((group: { id: string }) => group.id);

    let enrollments =
      yearFilter && filteredGroupIds.length === 0
        ? { data: [] as Array<Record<string, unknown>>, error: null }
        : await (() => {
            let query = db
              .from("enrollments")
              .select("id, class_group_id, student_id, status, attendance_rate")
              .eq("school_id", membership.schoolId)
              .in("status", ["pending", "active"]);
            if (yearFilter) query = query.in("class_group_id", filteredGroupIds);
            return query;
          })();
    if (
      enrollments.error &&
      /attendance_rate|42703|schema cache/i.test(enrollments.error.message)
    ) {
      enrollments = await (() => {
        let query = db
          .from("enrollments")
          .select("id, class_group_id, student_id, status")
          .eq("school_id", membership.schoolId)
          .in("status", ["pending", "active"]);
        if (yearFilter) query = query.in("class_group_id", filteredGroupIds);
        return query;
      })();
    }
    if (enrollments.error) {
      throw publicDatabaseError(enrollments.error, "Não foi possível carregar as matrículas.");
    }

    const { data: classSubjects } = filteredGroupIds.length
      ? await db
          .from("class_subjects")
          .select("id, class_group_id, subject_id, teacher_id, weekly_periods, status")
          .in("class_group_id", filteredGroupIds)
          .eq("status", "active")
      : { data: [] as Array<Record<string, unknown>> };

    const classSubjectIds = (classSubjects ?? []).map((row: Record<string, unknown>) =>
      String(row["id"]),
    );
    const { data: timetableSlots, error: scheduleError } = classSubjectIds.length
      ? await db
          .from("timetable_slots")
          .select("id, class_subject_id, weekday, starts_at, ends_at, room, status")
          .in("class_subject_id", classSubjectIds)
          .eq("status", "active")
          .order("starts_at")
          .limit(500)
      : { data: [] as Array<Record<string, unknown>>, error: null };

    const scheduleMissing = Boolean(scheduleError);
    const enrollmentIds = (enrollments.data ?? []).map((row) => String(row.id));
    let termGradeRows: Awaited<ReturnType<typeof listSgaTermGrades>> = [];
    let gradesMissing = false;
    try {
      termGradeRows = await listSgaTermGrades({
        db,
        schoolId: membership.schoolId,
        enrollmentIds,
        limit: 200,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /schema cache|does not exist|42P01|PGRST|grade_/i.test(error.message)
      ) {
        gradesMissing = true;
      } else {
        throw error;
      }
    }

    const enrollmentStats = new Map<string, { count: number; rates: number[] }>();
    for (const enrollment of enrollments.data ?? []) {
      const classGroupId = String(enrollment.class_group_id);
      const current = enrollmentStats.get(classGroupId) ?? { count: 0, rates: [] };
      current.count += 1;
      const rate = Number((enrollment as { attendance_rate?: number | null }).attendance_rate);
      if (Number.isFinite(rate)) current.rates.push(rate);
      enrollmentStats.set(classGroupId, current);
    }

    const programById = new Map(
      (programs.data ?? []).map((row: { id: string }) => [row.id, row as Record<string, unknown>]),
    );
    const gradeById = new Map(
      (grades.data ?? []).map((row: { id: string }) => [row.id, row as Record<string, unknown>]),
    );
    const campusById = new Map(
      (campuses.data ?? []).map((row: { id: string }) => [row.id, row as Record<string, unknown>]),
    );
    const yearById = new Map(
      (years.data ?? []).map((row: { id: string }) => [row.id, row as Record<string, unknown>]),
    );
    const groupById = new Map(
      (groups.data ?? []).map((row: { id: string }) => [row.id, row as Record<string, unknown>]),
    );
    const subjectById = new Map(
      ((subjects.data ?? []) as Array<{ id: string }>).map((row) => [
        row.id,
        row as Record<string, unknown>,
      ]),
    );
    const classSubjectById = new Map(
      (classSubjects ?? []).map((row: Record<string, unknown>) => [String(row["id"]), row]),
    );

    const classGroups: ClassGroupSummary[] = (groups.data ?? []).map(
      (group: Record<string, unknown>) => {
        const grade = gradeById.get(String(group["grade_level_id"]));
        const program = grade?.["program_id"] ? programById.get(String(grade["program_id"])) : null;
        const campus = group["campus_id"] ? campusById.get(String(group["campus_id"])) : null;
        const year = yearById.get(String(group["academic_year_id"]));
        const stats = enrollmentStats.get(String(group["id"]));
        return {
          id: String(group["id"]),
          academic_year_id: group["academic_year_id"] ? String(group["academic_year_id"]) : null,
          name: String(group["name"] ?? ""),
          code: String(group["code"] ?? ""),
          shift: String(group["shift"] ?? ""),
          status: String(group["status"] ?? "active"),
          campus_id: group["campus_id"] ? String(group["campus_id"]) : null,
          capacity: Number.isFinite(Number(group["capacity"])) ? Number(group["capacity"]) : null,
          whatsapp_invite_url: group["whatsapp_invite_url"]
            ? String(group["whatsapp_invite_url"])
            : null,
          whatsapp_group_name: group["whatsapp_group_name"]
            ? String(group["whatsapp_group_name"])
            : null,
          course_id: program ? String(program["id"] ?? "") : null,
          course_name: (program?.["name"] as string) ?? "—",
          grade_name: (grade?.["name"] as string) ?? "—",
          room_name: (campus?.["name"] as string) ?? "—",
          academic_year_name: (year?.["name"] as string) ?? "—",
          enrolled_count: stats?.count ?? 0,
          average_score: null,
          attendance_rate: averagePercent(stats?.rates ?? []),
        };
      },
    );

    const studentIds = [...new Set((enrollments.data ?? []).map((row) => String(row.student_id)))];
    const studentsById = new Map<
      string,
      {
        id: string;
        full_name: string;
        registration_number: string;
        photo_url: string | null;
      }
    >();
    if (studentIds.length > 0) {
      const { data: studentRows, error: studentsError } = await db
        .from("students")
        .select("id, student_number, person_id")
        .in("id", studentIds);
      if (studentsError) {
        throw publicDatabaseError(
          studentsError,
          "Não foi possível carregar os alunos das matrículas.",
        );
      }
      const personIds = [
        ...new Set((studentRows ?? []).map((row: { person_id: string }) => row.person_id)),
      ];
      const peopleById = await loadPeopleLite(db, membership.schoolId, personIds);
      for (const student of studentRows ?? []) {
        const person = peopleById.get(student.person_id);
        studentsById.set(student.id, {
          id: student.id,
          full_name: person?.full_name ?? "—",
          registration_number: student.student_number,
          photo_url: person?.photo_url ?? null,
        });
      }
    }

    const subjectRows = subjectsMissing
      ? []
      : ((subjects.data ?? []) as Array<Record<string, unknown>>).map((subject) => ({
          id: String(subject["id"] ?? ""),
          name: String(subject["name"] ?? ""),
          code: String(subject["code"] ?? ""),
          teacher_name: null,
          weekly_hours: 0,
          grade_from: null,
          grade_to: null,
          classes_label: "—",
          weekly_hours_label: "—",
          approval_rate: null,
        }));

    const enrollmentOptions = (enrollments.data ?? []).map((enrollment) => {
      const group = groupById.get(String(enrollment.class_group_id));
      const student = studentsById.get(String(enrollment.student_id));
      return {
        id: String(enrollment.id),
        label: `${student?.full_name ?? "Aluno"} · ${(group?.["name"] as string) ?? "Turma"}`,
        student_id: student?.id ?? String(enrollment.student_id),
        student_name: student?.full_name ?? "—",
        student_photo_url: student?.photo_url ?? null,
        registration_number: student?.registration_number ?? null,
        class_group_id: enrollment.class_group_id ? String(enrollment.class_group_id) : null,
        class_group_name: (group?.["name"] as string) ?? "—",
      };
    });

    const scheduleRows: ScheduleSlotSummary[] = scheduleMissing
      ? []
      : (timetableSlots ?? []).map((slot: Record<string, unknown>) => {
          const classSubject = classSubjectById.get(String(slot["class_subject_id"]));
          const subjectIdRaw = classSubject?.["subject_id"];
          const subject = subjectIdRaw ? subjectById.get(String(subjectIdRaw)) : null;
          const classGroupIdRaw = classSubject?.["class_group_id"];
          const classGroup = classGroupIdRaw ? groupById.get(String(classGroupIdRaw)) : null;
          return {
            id: String(slot["id"] ?? ""),
            class_group_id: classGroupIdRaw ? String(classGroupIdRaw) : null,
            weekday: Number(slot["weekday"] ?? 0),
            starts_at: String(slot["starts_at"] ?? ""),
            ends_at: String(slot["ends_at"] ?? ""),
            subject_id: subjectIdRaw ? String(subjectIdRaw) : null,
            teacher_id: classSubject?.["teacher_id"] ? String(classSubject["teacher_id"]) : null,
            label: slot["room"] ? String(slot["room"]) : null,
            subject_name: (subject?.["name"] as string | null) ?? null,
            display_label: (subject?.["name"] as string) ?? (slot["room"] as string) ?? "—",
            class_group_name: (classGroup?.["name"] as string) ?? "—",
          };
        });

    const academicYears = (years.data ?? []).map((year: Record<string, unknown>) =>
      toStructureSummary(year),
    );

    const enrollmentByIdMap = new Map(
      (enrollments.data ?? []).map((row) => [String(row["id"]), row]),
    );
    const subjectPassRates = new Map<string, { pass: number; total: number }>();
    const termGrades = gradesMissing
      ? []
      : termGradeRows.map((grade) => {
          const enrollment = enrollmentByIdMap.get(grade.enrollment_id);
          const group = enrollment
            ? groupById.get(String(enrollment.class_group_id))
            : grade.class_group_id
              ? groupById.get(grade.class_group_id)
              : undefined;
          const student = enrollment ? studentsById.get(String(enrollment.student_id)) : undefined;
          const subject = subjectById.get(grade.subject_id);
          const average = scoreAverage(grade.mac, grade.npp, grade.npt);
          const passStats = subjectPassRates.get(grade.subject_id) ?? { pass: 0, total: 0 };
          passStats.total += 1;
          if (average >= 10) passStats.pass += 1;
          subjectPassRates.set(grade.subject_id, passStats);
          return {
            id: grade.id,
            enrollment_id: grade.enrollment_id,
            subject_id: grade.subject_id,
            term: grade.term,
            mac: grade.mac,
            npp: grade.npp,
            npt: grade.npt,
            average,
            student_id: student?.id ?? (enrollment ? String(enrollment.student_id) : null),
            student_name: student?.full_name ?? "—",
            student_photo_url: student?.photo_url ?? null,
            registration_number: student?.registration_number ?? null,
            class_group_id: enrollment
              ? String(enrollment.class_group_id)
              : grade.class_group_id
                ? String(grade.class_group_id)
                : null,
            class_group_name: (group?.["name"] as string) ?? "—",
            subject_name: (subject?.["name"] as string) ?? "—",
            term_label: `${grade.term}º` as const,
            updated_at: grade.updated_at,
          };
        });

    const subjectsWithRates = subjectRows.map((subject) => {
      const stats = subjectPassRates.get(String(subject.id));
      return {
        ...subject,
        approval_rate:
          stats && stats.total > 0 ? Math.round((stats.pass / stats.total) * 100) : null,
      };
    });

    const classSubjectNav: ClassSubjectNav[] = (classSubjects ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const subject = record["subject_id"] ? subjectById.get(String(record["subject_id"])) : null;
      return {
        class_group_id: String(record["class_group_id"] ?? ""),
        subject_id: String(record["subject_id"] ?? ""),
        subject_name: String(subject?.["name"] ?? "Disciplina"),
        teacher_id: record["teacher_id"] ? String(record["teacher_id"]) : null,
      };
    });

    return {
      academicYears,
      courses: (programs.data ?? []).map((row: Record<string, unknown>) => toStructureSummary(row)),
      gradeLevels: (grades.data ?? []).map((row: Record<string, unknown>) =>
        toStructureSummary(row),
      ),
      rooms: (campuses.data ?? []).map((row: Record<string, unknown>) => toStructureSummary(row)),
      classGroups,
      subjects: subjectsWithRates,
      classSubjects: classSubjectNav,
      termGrades,
      enrollmentOptions,
      scheduleSlots: scheduleRows,
      subjectsAvailable: !subjectsMissing,
      gradesAvailable: !gradesMissing,
      scheduleAvailable: !scheduleMissing,
    };
  });

export const createClassGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createClassGroupInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const payload = {
      school_id: membership.schoolId,
      academic_year_id: data.academicYearId,
      grade_level_id: data.gradeLevelId,
      campus_id: data.roomId ?? null,
      code: data.code,
      name: data.name,
      shift: data.shift,
      capacity: data.capacity ?? 30,
      status: "active",
      whatsapp_invite_url: data.whatsappInviteUrl ?? null,
      whatsapp_group_name: data.whatsappGroupName ?? null,
      created_by: context.userId,
      updated_by: context.userId,
    };
    let { data: group, error } = await db.from("class_groups").insert(payload).select("*").single();
    if (error && (error.code === "42703" || /whatsapp_/i.test(error.message))) {
      const {
        whatsapp_invite_url: _invite,
        whatsapp_group_name: _name,
        ...withoutWhatsapp
      } = payload;
      ({ data: group, error } = await db
        .from("class_groups")
        .insert(withoutWhatsapp)
        .select("*")
        .single());
    }

    if (error) throw publicDatabaseError(error, "Não foi possível criar a turma.");
    return group;
  });

export const updateClassGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateClassGroupInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const payload = {
      code: data.code,
      name: data.name,
      shift: data.shift,
      capacity: data.capacity ?? 30,
      campus_id: data.roomId ?? null,
      status: data.status,
      whatsapp_invite_url: data.whatsappInviteUrl ?? null,
      whatsapp_group_name: data.whatsappGroupName ?? null,
      updated_by: context.userId,
    };
    let { data: group, error } = await db
      .from("class_groups")
      .update(payload)
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("*")
      .maybeSingle();
    if (error && (error.code === "42703" || /whatsapp_/i.test(error.message))) {
      const {
        whatsapp_invite_url: _invite,
        whatsapp_group_name: _name,
        ...withoutWhatsapp
      } = payload;
      ({ data: group, error } = await db
        .from("class_groups")
        .update(withoutWhatsapp)
        .eq("id", data.id)
        .eq("school_id", membership.schoolId)
        .select("*")
        .maybeSingle());
    }
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a turma.");
    if (!group) throw new Error("Turma não encontrada.");
    return group;
  });

export const deleteClassGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteClassGroupInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { count, error: countError } = await db
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_group_id", data.id)
      .eq("school_id", membership.schoolId)
      .in("status", ["active", "pending"]);
    if (countError) {
      throw publicDatabaseError(countError, "Não foi possível validar matrículas da turma.");
    }
    if ((count ?? 0) > 0) {
      throw new Error(
        "Esta turma ainda tem matrículas activas. Transfira ou anule as matrículas antes de excluir.",
      );
    }
    const { data: group, error } = await db
      .from("class_groups")
      .update({ status: "inactive", updated_by: context.userId })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível desactivar a turma.");
    if (!group) throw new Error("Turma não encontrada.");
    return group;
  });

export const createSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createSubjectInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: subject, error } = await db
      .from("subjects")
      .insert({
        school_id: membership.schoolId,
        code: data.code,
        name: data.name,
        short_name: data.name.slice(0, 20),
        status: "active",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar a disciplina.");
    return subject;
  });

export const updateSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSubjectInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: subject, error } = await db
      .from("subjects")
      .update({
        code: data.code,
        name: data.name,
        short_name: data.name.slice(0, 20),
        updated_by: context.userId,
      })
      .eq("id", data.subjectId)
      .eq("school_id", membership.schoolId)
      .select("id, code, name")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a disciplina.");
    if (!subject) throw new Error("Disciplina não encontrada.");
    return subject;
  });

export const deactivateSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deactivateSubjectInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { count, error: linkError } = await db
      .from("class_subjects")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId)
      .eq("subject_id", data.subjectId)
      .eq("status", "active");
    if (linkError) {
      throw publicDatabaseError(linkError, "Não foi possível validar as turmas da disciplina.");
    }
    if ((count ?? 0) > 0) {
      throw new Error(
        "Esta disciplina ainda está ligada a turmas. Desligue o professor ou remova a ligação antes de desactivar.",
      );
    }
    const { data: subject, error } = await db
      .from("subjects")
      .update({ status: "inactive", updated_by: context.userId })
      .eq("id", data.subjectId)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível desactivar a disciplina.");
    if (!subject) throw new Error("Disciplina não encontrada.");
    return subject;
  });

export const listTermGrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listTermGradesInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const rows = await listSgaTermGrades({
      db,
      schoolId: membership.schoolId,
      limit: data.limit,
    });
    return rows
      .filter((row) => (data.term ? row.term === data.term : true))
      .map((row) => ({
        id: row.id,
        enrollment_id: row.enrollment_id,
        subject_id: row.subject_id,
        term: row.term,
        mac: row.mac,
        npp: row.npp,
        npt: row.npt,
        updated_at: row.updated_at,
      }));
  });

export const upsertTermGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertTermGradeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    await assertTermOpen(db, membership.schoolId, data.term);
    return upsertSgaTermGrade({
      db,
      schoolId: membership.schoolId,
      userId: context.userId,
      enrollmentId: data.enrollmentId,
      subjectId: data.subjectId,
      term: data.term,
      mac: data.mac,
      npp: data.npp,
      npt: data.npt,
    });
  });

export const upsertTermGradesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertTermGradesBatchInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    await assertTermOpen(db, membership.schoolId, data.term);
    return upsertSgaTermGradesBatch({
      db,
      schoolId: membership.schoolId,
      userId: context.userId,
      subjectId: data.subjectId,
      term: data.term,
      rows: data.rows,
    });
  });

export const createScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createScheduleSlotInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    if (!data.subjectId) throw new Error("Seleccione uma disciplina para o horário.");

    let classSubjectId: string | null = null;
    let teacherId: string | null = null;
    const { data: existing, error: existingError } = await db
      .from("class_subjects")
      .select("id, teacher_id")
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", data.classGroupId)
      .eq("subject_id", data.subjectId)
      .eq("status", "active")
      .maybeSingle();
    if (existingError) {
      throw publicDatabaseError(existingError, "Não foi possível associar a disciplina à turma.");
    }
    if (existing?.id) {
      classSubjectId = existing.id;
      teacherId = existing.teacher_id ?? null;
    } else {
      teacherId = await ensureDefaultTeacher(db, membership.schoolId, context.userId);
      const { data: created, error: csError } = await db
        .from("class_subjects")
        .insert({
          school_id: membership.schoolId,
          class_group_id: data.classGroupId,
          subject_id: data.subjectId,
          teacher_id: teacherId,
          weekly_periods: 1,
          status: "active",
          created_by: context.userId,
          updated_by: context.userId,
        })
        .select("id")
        .single();
      if (csError)
        throw publicDatabaseError(csError, "Não foi possível associar a disciplina à turma.");
      classSubjectId = created.id;
    }
    if (!classSubjectId) throw new Error("Não foi possível associar a disciplina à turma.");

    const startsAt = data.startsAt.length === 5 ? `${data.startsAt}:00` : data.startsAt;
    const endsAt = data.endsAt.length === 5 ? `${data.endsAt}:00` : data.endsAt;
    const room = data.label?.trim() || "Sala";
    await assertScheduleSlotAvailable({
      db,
      schoolId: membership.schoolId,
      classGroupId: data.classGroupId,
      teacherId,
      weekday: data.weekday,
      startsAt,
      endsAt,
      room,
    });

    const { data: slot, error } = await db
      .from("timetable_slots")
      .insert({
        school_id: membership.schoolId,
        class_subject_id: classSubjectId,
        weekday: data.weekday,
        starts_at: startsAt,
        ends_at: endsAt,
        // SGA: room is NOT NULL — use rótulo or a safe default.
        room,
        status: "active",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o slot de horário.");
    return slot;
  });

export const updateScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateScheduleSlotInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: currentSlot, error: slotError } = await db
      .from("timetable_slots")
      .select("id, class_subject_id")
      .eq("id", data.slotId)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .maybeSingle();
    if (slotError)
      throw publicDatabaseError(slotError, "Não foi possível carregar o slot de horário.");
    if (!currentSlot) throw new Error("Slot não encontrado ou já inactivo.");

    const { data: classSubject, error: subjectError } = await db
      .from("class_subjects")
      .select("id, class_group_id, teacher_id")
      .eq("id", currentSlot.class_subject_id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (subjectError) {
      throw publicDatabaseError(subjectError, "Não foi possível validar o slot de horário.");
    }
    if (!classSubject) throw new Error("A disciplina deste slot já não está disponível.");

    const startsAt = `${data.startsAt}:00`;
    const endsAt = `${data.endsAt}:00`;
    const room = data.label?.trim() || "Sala";
    await assertScheduleSlotAvailable({
      db,
      schoolId: membership.schoolId,
      classGroupId: String(classSubject.class_group_id),
      teacherId: classSubject.teacher_id ? String(classSubject.teacher_id) : null,
      weekday: data.weekday,
      startsAt,
      endsAt,
      room,
      excludeSlotId: data.slotId,
    });

    const { data: slot, error } = await db
      .from("timetable_slots")
      .update({
        weekday: data.weekday,
        starts_at: startsAt,
        ends_at: endsAt,
        room,
      })
      .eq("id", data.slotId)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o slot de horário.");
    if (!slot) throw new Error("Slot não encontrado ou já inactivo.");
    return { id: slot.id };
  });

export const deleteScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteScheduleSlotInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: slot, error } = await db
      .from("timetable_slots")
      .update({ status: "inactive" })
      .eq("id", data.slotId)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível remover o slot de horário.");
    if (!slot) throw new Error("Slot não encontrado ou já inactivo.");
    return { id: slot.id };
  });

export const assignClassSubjectTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignClassSubjectTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const [{ data: group }, { data: teacher }, { data: subject }] = await Promise.all([
      db
        .from("class_groups")
        .select("id")
        .eq("id", data.classGroupId)
        .eq("school_id", membership.schoolId)
        .maybeSingle(),
      db
        .from("teachers")
        .select("id")
        .eq("id", data.teacherId)
        .eq("school_id", membership.schoolId)
        .maybeSingle(),
      db
        .from("subjects")
        .select("id")
        .eq("id", data.subjectId)
        .eq("school_id", membership.schoolId)
        .maybeSingle(),
    ]);
    if (!group) throw new Error("Turma não encontrada nesta escola.");
    if (!teacher) throw new Error("Professor não encontrado nesta escola.");
    if (!subject) throw new Error("Disciplina não encontrada nesta escola.");

    const { data: existing, error: existingError } = await db
      .from("class_subjects")
      .select("id")
      .eq("class_group_id", data.classGroupId)
      .eq("subject_id", data.subjectId)
      .maybeSingle();
    if (existingError && !isMissingRelation(existingError)) {
      throw publicDatabaseError(existingError, "Não foi possível ler as disciplinas da turma.");
    }
    if (existingError && isMissingRelation(existingError)) {
      throw new Error("Aplique APPLY_ENROLLMENT_AND_PREMIUM.sql para ligar professores às turmas.");
    }

    if (existing?.id) {
      const { error } = await db
        .from("class_subjects")
        .update({
          teacher_id: data.teacherId,
          status: "active",
          updated_by: context.userId,
        })
        .eq("id", existing.id)
        .eq("school_id", membership.schoolId);
      if (error) throw publicDatabaseError(error, "Não foi possível actualizar o docente.");
      return { id: existing.id, updated: true };
    }

    const { data: created, error } = await db
      .from("class_subjects")
      .insert({
        school_id: membership.schoolId,
        class_group_id: data.classGroupId,
        subject_id: data.subjectId,
        teacher_id: data.teacherId,
        weekly_periods: 4,
        status: "active",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível atribuir o professor.");
    return { id: created.id, updated: false };
  });

export const unassignClassSubjectTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => unassignClassSubjectTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: existing, error: loadError } = await db
      .from("class_subjects")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", data.classGroupId)
      .eq("subject_id", data.subjectId)
      .maybeSingle();
    if (loadError && isMissingRelation(loadError)) {
      throw new Error("Aplique APPLY_ENROLLMENT_AND_PREMIUM.sql para ligar professores às turmas.");
    }
    if (loadError)
      throw publicDatabaseError(loadError, "Não foi possível ler a disciplina da turma.");
    if (!existing?.id) throw new Error("Esta turma ainda não tem essa disciplina atribuída.");

    const { error } = await db
      .from("class_subjects")
      .update({
        teacher_id: null,
        updated_by: context.userId,
      })
      .eq("id", existing.id)
      .eq("school_id", membership.schoolId);
    if (error) throw publicDatabaseError(error, "Não foi possível desligar o professor.");
    return { id: existing.id, teacherId: null };
  });

export const ensureAcademicDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ensureAcademicDefaultsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const [years, programs, grades, campuses] = await Promise.all([
      db.from("academic_years").select("id").eq("school_id", membership.schoolId).limit(1),
      db.from("programs").select("id").eq("school_id", membership.schoolId).limit(1),
      db.from("grade_levels").select("id").eq("school_id", membership.schoolId).limit(1),
      db.from("campuses").select("id").eq("school_id", membership.schoolId).limit(1),
    ]);
    if (years.error || programs.error || grades.error || campuses.error) {
      throw new Error("Não foi possível verificar a estrutura académica SGA.");
    }

    const created: string[] = [];

    if ((years.data ?? []).length === 0) {
      const yearName = data.yearName ?? "2026/2027";
      const { error } = await db.from("academic_years").insert({
        school_id: membership.schoolId,
        name: yearName,
        starts_on: "2026-09-01",
        ends_on: "2027-07-31",
        status: "active",
      });
      if (error) throw publicDatabaseError(error, "Não foi possível criar o ano lectivo.");
      created.push("ano lectivo");
    }

    if ((programs.data ?? []).length === 0) {
      const { data: level } = await db
        .from("academic_levels")
        .select("id")
        .eq("school_id", membership.schoolId)
        .limit(1)
        .maybeSingle();
      if (!level?.id) {
        throw new Error("Crie primeiro um nível académico na escola SGA.");
      }
      const { error } = await db.from("programs").insert({
        school_id: membership.schoolId,
        academic_level_id: level.id,
        code: "GERAL",
        name: "Ensino Geral",
        kind: "general",
        is_active: true,
      });
      if (error) throw publicDatabaseError(error, "Não foi possível criar o programa.");
      created.push("programa");
    }

    if ((campuses.data ?? []).length === 0) {
      const { error } = await db.from("campuses").insert({
        school_id: membership.schoolId,
        code: "SEDE",
        name: "Campus Principal",
        is_active: true,
      });
      if (error) throw publicDatabaseError(error, "Não foi possível criar o campus.");
      created.push("campus");
    }

    const { data: subjectRows } = await db
      .from("subjects")
      .select("id")
      .eq("school_id", membership.schoolId)
      .limit(1);
    if ((subjectRows ?? []).length === 0) {
      const defaults = [
        { code: "MAT", name: "Matemática", short_name: "Mat" },
        { code: "PORT", name: "Língua Portuguesa", short_name: "Port" },
        { code: "CN", name: "Ciências Naturais", short_name: "CN" },
        { code: "HIST", name: "História", short_name: "Hist" },
        { code: "ING", name: "Inglês", short_name: "Ing" },
      ];
      const { error } = await db.from("subjects").insert(
        defaults.map((subject) => ({
          school_id: membership.schoolId,
          code: subject.code,
          name: subject.name,
          short_name: subject.short_name,
          status: "active",
          created_by: context.userId,
          updated_by: context.userId,
        })),
      );
      if (error) throw publicDatabaseError(error, "Não foi possível criar disciplinas iniciais.");
      created.push("disciplinas");
    }

    const { data: teachers } = await db
      .from("teachers")
      .select("id")
      .eq("school_id", membership.schoolId)
      .limit(1);
    if ((teachers ?? []).length === 0) {
      await ensureDefaultTeacher(db, membership.schoolId, context.userId);
      created.push("professor");
    }

    const { data: yearRow } = await db
      .from("academic_years")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (yearRow?.id) {
      const { data: termRows } = await db
        .from("terms")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("academic_year_id", yearRow.id)
        .limit(1);
      if ((termRows ?? []).length === 0) {
        const { error } = await db.from("terms").insert([
          {
            school_id: membership.schoolId,
            academic_year_id: yearRow.id,
            name: "1º Trimestre",
            sequence: 1,
            starts_on: "2026-09-01",
            ends_on: "2026-12-15",
          },
          {
            school_id: membership.schoolId,
            academic_year_id: yearRow.id,
            name: "2º Trimestre",
            sequence: 2,
            starts_on: "2027-01-05",
            ends_on: "2027-03-20",
          },
          {
            school_id: membership.schoolId,
            academic_year_id: yearRow.id,
            name: "3º Trimestre",
            sequence: 3,
            starts_on: "2027-04-01",
            ends_on: "2027-07-15",
          },
        ]);
        if (error) throw publicDatabaseError(error, "Não foi possível criar trimestres.");
        created.push("trimestres");
      }
    }

    return {
      created,
      message:
        created.length > 0
          ? `Estrutura SGA preparada: ${created.join(", ")}.`
          : "A estrutura académica SGA já está pronta.",
    };
  });

const weekdayLabels = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export const getTeacherWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getTeacherWorkspaceInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    let teacherId = data.teacherId ?? null;
    let teacherName = "";
    if (!teacherId) {
      const byUser = await db
        .from("teachers")
        .select("id, person_id")
        .eq("school_id", membership.schoolId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!byUser.error && byUser.data?.id) {
        teacherId = String(byUser.data.id);
        if (byUser.data.person_id) {
          const { data: person } = await db
            .from("people")
            .select("full_name")
            .eq("id", byUser.data.person_id)
            .maybeSingle();
          teacherName = String(person?.full_name ?? "");
        }
      }
    }
    if (!teacherId) {
      let email = "";
      let fullName = "";
      try {
        const { data: authUser } = await db.auth.admin.getUserById(context.userId);
        email = String(authUser.user?.email ?? "").toLowerCase();
        fullName = String(authUser.user?.user_metadata?.["full_name"] ?? "");
      } catch {
        email = "";
      }
      const { data: people } = await db
        .from("people")
        .select("id, full_name, email")
        .eq("school_id", membership.schoolId);
      const person =
        (people ?? []).find((row) => String(row.email ?? "").toLowerCase() === email && email) ??
        (people ?? []).find(
          (row) =>
            fullName && String(row.full_name ?? "").toLowerCase() === fullName.trim().toLowerCase(),
        );
      if (person) {
        const { data: teacher } = await db
          .from("teachers")
          .select("id")
          .eq("school_id", membership.schoolId)
          .eq("person_id", person.id)
          .maybeSingle();
        teacherId = teacher?.id ?? null;
        teacherName = String(person.full_name ?? "");
      }
    } else {
      const { data: teacher } = await db
        .from("teachers")
        .select("id, person_id")
        .eq("id", teacherId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (teacher?.person_id) {
        const { data: person } = await db
          .from("people")
          .select("full_name")
          .eq("id", teacher.person_id)
          .maybeSingle();
        teacherName = String(person?.full_name ?? "");
      }
    }

    if (!teacherId) {
      return {
        teacherId: null,
        teacherName,
        classes: [] as Array<{
          id: string;
          name: string;
          grade_name: string;
          course_name: string;
          subject_id: string;
          subject_name: string;
          enrolled_count: number;
        }>,
        enrollments: [] as Array<{
          id: string;
          student_name: string;
          class_group_name: string;
          subject_name: string;
        }>,
        schedule: [] as Array<{
          id: string;
          weekday: number;
          weekday_label: string;
          starts_at: string;
          ends_at: string;
          subject_name: string;
          class_group_name: string;
        }>,
      };
    }

    const subjectsQuery = db
      .from("class_subjects")
      .select("id, class_group_id, subject_id, teacher_id")
      .eq("school_id", membership.schoolId)
      .eq("teacher_id", teacherId)
      .eq("status", "active");
    const { data: assignments } = await subjectsQuery;
    const classGroupIds = [
      ...new Set((assignments ?? []).map((row) => String(row.class_group_id)).filter(Boolean)),
    ];
    const subjectIds = [
      ...new Set((assignments ?? []).map((row) => String(row.subject_id)).filter(Boolean)),
    ];
    const classSubjectIds = (assignments ?? []).map((row) => String(row.id));

    const [{ data: groups }, { data: subjects }, { data: enrollments }, { data: slots }] =
      await Promise.all([
        classGroupIds.length
          ? db
              .from("class_groups")
              .select("id, name, grade_level_id")
              .in("id", classGroupIds)
              .eq("school_id", membership.schoolId)
          : Promise.resolve({
              data: [] as Array<{ id: string; name: string; grade_level_id?: string | null }>,
            }),
        subjectIds.length
          ? db.from("subjects").select("id, name").in("id", subjectIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
        classGroupIds.length
          ? db
              .from("enrollments")
              .select("id, student_id, class_group_id, status")
              .in("class_group_id", classGroupIds)
              .eq("school_id", membership.schoolId)
              .eq("status", "active")
          : Promise.resolve({
              data: [] as Array<{
                id: string;
                student_id: string;
                class_group_id: string;
                status: string;
              }>,
            }),
        classSubjectIds.length
          ? db
              .from("timetable_slots")
              .select("id, class_subject_id, weekday, starts_at, ends_at")
              .in("class_subject_id", classSubjectIds)
              .eq("school_id", membership.schoolId)
              .order("weekday")
          : Promise.resolve({
              data: [] as Array<{
                id: string;
                class_subject_id: string;
                weekday: number;
                starts_at: string;
                ends_at: string;
              }>,
            }),
      ]);

    const gradeIds = [
      ...new Set((groups ?? []).map((row) => String(row.grade_level_id ?? "")).filter(Boolean)),
    ];
    const { data: gradeRows } = gradeIds.length
      ? await db.from("grade_levels").select("id, name, program_id").in("id", gradeIds)
      : { data: [] as Array<{ id: string; name: string; program_id?: string | null }> };
    const programIds = [
      ...new Set((gradeRows ?? []).map((row) => String(row.program_id ?? "")).filter(Boolean)),
    ];
    const { data: programRows } = programIds.length
      ? await db.from("programs").select("id, name").in("id", programIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const gradeById = new Map((gradeRows ?? []).map((row) => [row.id, row]));
    const programById = new Map((programRows ?? []).map((row) => [row.id, row.name]));
    const groupById = new Map((groups ?? []).map((row) => [row.id, row.name]));
    const subjectById = new Map((subjects ?? []).map((row) => [row.id, row.name]));
    const assignmentByClass = new Map(
      (assignments ?? []).map((row) => [String(row.class_group_id), row]),
    );
    const studentIds = [...new Set((enrollments ?? []).map((row) => String(row.student_id)))];
    const { data: studentRows } = studentIds.length
      ? await db.from("students").select("id, person_id").in("id", studentIds)
      : { data: [] as Array<{ id: string; person_id: string }> };
    const personIds = [...new Set((studentRows ?? []).map((row) => row.person_id))];
    const personNameById = await loadPersonNamesById(db, membership.schoolId, personIds);
    const studentNameById = new Map(
      (studentRows ?? []).map((row) => [row.id, personNameById.get(row.person_id) ?? "Aluno"]),
    );

    const groupMap = new Map((groups ?? []).map((item) => [item.id, item]));
    const assignmentByIdMap = new Map((assignments ?? []).map((row) => [String(row.id), row]));
    const enrollmentCountByClass = new Map<string, number>();
    for (const enrollment of enrollments ?? []) {
      const cId = String(enrollment.class_group_id);
      enrollmentCountByClass.set(cId, (enrollmentCountByClass.get(cId) ?? 0) + 1);
    }

    const classes = (assignments ?? []).map((row) => {
      const group = groupMap.get(String(row.class_group_id));
      const grade = group?.grade_level_id ? gradeById.get(String(group.grade_level_id)) : null;
      return {
        id: String(row.class_group_id),
        name: groupById.get(String(row.class_group_id)) ?? "Turma",
        grade_name: String(grade?.name ?? groupById.get(String(row.class_group_id)) ?? "Classe"),
        course_name: grade?.program_id ? (programById.get(String(grade.program_id)) ?? "—") : "—",
        subject_id: String(row.subject_id ?? ""),
        subject_name: subjectById.get(String(row.subject_id)) ?? "Disciplina",
        enrolled_count: enrollmentCountByClass.get(String(row.class_group_id)) ?? 0,
      };
    });

    const enrollmentRows = (enrollments ?? []).map((row) => {
      const assignment = assignmentByClass.get(String(row.class_group_id));
      return {
        id: String(row.id),
        student_id: String(row.student_id),
        student_name: studentNameById.get(String(row.student_id)) ?? "Aluno",
        class_group_name: groupById.get(String(row.class_group_id)) ?? "Turma",
        subject_name: assignment
          ? (subjectById.get(String(assignment.subject_id)) ?? "Disciplina")
          : "Disciplina",
      };
    });

    const schedule = (slots ?? []).map((slot) => {
      const assignment = assignmentByIdMap.get(String(slot.class_subject_id));
      const weekday = Number(slot.weekday);
      return {
        id: String(slot.id),
        weekday,
        weekday_label: weekdayLabels[weekday] ?? `Dia ${weekday}`,
        starts_at: String(slot.starts_at).slice(0, 5),
        ends_at: String(slot.ends_at).slice(0, 5),
        subject_name: assignment
          ? (subjectById.get(String(assignment.subject_id)) ?? "Disciplina")
          : "Disciplina",
        class_group_name: assignment
          ? (groupById.get(String(assignment.class_group_id)) ?? "Turma")
          : "Turma",
      };
    });

    return {
      teacherId,
      teacherName,
      classes,
      enrollments: enrollmentRows,
      schedule,
    };
  });

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    /schema cache|does not exist|relation .* does not exist/i.test(String(error?.message ?? ""))
  );
}

export const listAssessments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAssessmentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return { available: false, items: [], scores: [] };
    const db = await loadSgaAdminClient();
    let query = db
      .from("siga_assessment_items")
      .select(
        "id, class_group_id, subject_id, term, name, kind, component, assessed_on, max_score, counts_toward_pauta, allow_recovery, description, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .order("assessed_on", { ascending: true });
    if (data.classGroupId) query = query.eq("class_group_id", data.classGroupId);
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);
    if (data.term) query = query.eq("term", data.term);
    const { data: items, error } = await query;
    if (error) {
      if (isMissingRelation(error)) return { available: false, items: [], scores: [] };
      throw publicDatabaseError(error, "Não foi possível carregar as avaliações.");
    }
    const itemIds = (items ?? []).map((item) => String(item.id));
    const { data: scores, error: scoreError } = itemIds.length
      ? await db
          .from("siga_assessment_scores")
          .select("id, item_id, enrollment_id, score, previous_score, updated_at")
          .eq("school_id", membership.schoolId)
          .in("item_id", itemIds)
      : { data: [], error: null };
    if (scoreError && !isMissingRelation(scoreError)) {
      throw publicDatabaseError(scoreError, "Não foi possível carregar as notas das avaliações.");
    }
    return {
      available: true,
      items: items ?? [],
      scores: scores ?? [],
    };
  });

export const createAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createAssessmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const { data: created, error } = await db
      .from("siga_assessment_items")
      .insert({
        school_id: membership.schoolId,
        class_group_id: data.classGroupId,
        subject_id: data.subjectId,
        term: data.term,
        name: data.name,
        kind: data.kind,
        component: data.component,
        assessed_on: data.assessedOn ?? null,
        max_score: data.maxScore,
        counts_toward_pauta: data.countsTowardPauta,
        allow_recovery: data.allowRecovery,
        description: data.description ?? null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, name, kind, component")
      .single();
    if (error) {
      if (isMissingRelation(error)) {
        throw new Error(
          "Tabelas de avaliações em falta. Corra supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql.",
        );
      }
      throw publicDatabaseError(error, "Não foi possível criar a avaliação.");
    }
    return created;
  });

export const upsertAssessmentScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertAssessmentScoresInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const { data: item, error: itemError } = await db
      .from("siga_assessment_items")
      .select("id, term")
      .eq("id", data.itemId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (itemError) {
      if (isMissingRelation(itemError)) {
        throw new Error(
          "Tabelas de avaliações em falta. Corra supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql.",
        );
      }
      throw publicDatabaseError(itemError, "Não foi possível validar a avaliação.");
    }
    if (!item?.id) throw new Error("Avaliação não encontrada.");
    await assertTermOpen(db, membership.schoolId, Number(item.term));

    // 1 SELECT para todos os alunos do lote + 1 INSERT em lote (novos) + updates em
    // paralelo — substitui o anterior select+insert/update sequencial por aluno, que
    // tornava lançar notas de uma turma inteira em dezenas de idas e vindas à base.
    const enrollmentIds = data.rows.map((row) => row.enrollmentId);
    const { data: existingRows, error: existingError } = await db
      .from("siga_assessment_scores")
      .select("id, score, enrollment_id")
      .eq("item_id", data.itemId)
      .in("enrollment_id", enrollmentIds);
    if (existingError) {
      throw publicDatabaseError(existingError, "Não foi possível verificar as notas existentes.");
    }
    const existingByEnrollment = new Map(
      (existingRows ?? []).map((row: { id: string; score: number; enrollment_id: string }) => [
        row.enrollment_id,
        row,
      ]),
    );
    const toInsert = data.rows.filter((row) => !existingByEnrollment.has(row.enrollmentId));
    const toUpdate = data.rows.filter((row) => existingByEnrollment.has(row.enrollmentId));

    const [insertResult, ...updateResults] = await Promise.all([
      toInsert.length
        ? db.from("siga_assessment_scores").insert(
            toInsert.map((row) => ({
              school_id: membership.schoolId,
              item_id: data.itemId,
              enrollment_id: row.enrollmentId,
              score: row.score,
              recorded_by: context.userId,
            })),
          )
        : Promise.resolve({ error: null }),
      ...toUpdate.map((row) => {
        const existing = existingByEnrollment.get(row.enrollmentId)!;
        return db
          .from("siga_assessment_scores")
          .update({
            previous_score: existing.score,
            score: row.score,
            recorded_by: context.userId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("school_id", membership.schoolId);
      }),
    ]);
    if (insertResult.error)
      throw publicDatabaseError(insertResult.error, "Não foi possível lançar as notas.");
    for (const result of updateResults) {
      if (result.error)
        throw publicDatabaseError(result.error, "Não foi possível actualizar as notas.");
    }
    return { saved: data.rows.length };
  });

export const updateAssessmentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAssessmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const { data: updated, error } = await db
      .from("siga_assessment_items")
      .update({
        name: data.name,
        kind: data.kind,
        component: data.component,
        assessed_on: data.assessedOn ?? null,
        max_score: data.maxScore,
        counts_toward_pauta: data.countsTowardPauta,
        allow_recovery: data.allowRecovery,
        description: data.description ?? null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id, name, kind, component, term")
      .single();

    if (error) {
      throw publicDatabaseError(error, "Não foi possível atualizar a avaliação.");
    }
    return { success: true, item: updated };
  });

export const deleteAssessmentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteAssessmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();

    // Check if assessment scores exist
    const { count, error: countErr } = await db
      .from("siga_assessment_scores")
      .select("*", { count: "exact", head: true })
      .eq("item_id", data.itemId)
      .eq("school_id", membership.schoolId);

    if (countErr && !isMissingRelation(countErr)) {
      throw publicDatabaseError(countErr, "Não foi possível verificar as notas da avaliação.");
    }

    if ((count ?? 0) > 0 && !data.force) {
      throw new Error(
        `Esta avaliação possui ${count} nota(s) lançada(s). Confirme que pretende eliminar todas as notas associadas.`,
      );
    }

    // Delete scores first if any exist
    if ((count ?? 0) > 0) {
      const { error: delScoresErr } = await db
        .from("siga_assessment_scores")
        .delete()
        .eq("item_id", data.itemId)
        .eq("school_id", membership.schoolId);

      if (delScoresErr) {
        throw publicDatabaseError(delScoresErr, "Não foi possível eliminar as notas associadas.");
      }
    }

    // Delete item
    const { error: delItemErr } = await db
      .from("siga_assessment_items")
      .delete()
      .eq("id", data.itemId)
      .eq("school_id", membership.schoolId);

    if (delItemErr) {
      throw publicDatabaseError(delItemErr, "Não foi possível eliminar a avaliação.");
    }

    return { success: true, deletedScoresCount: count ?? 0 };
  });
