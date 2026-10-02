import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadActivePassingValue } from "./exam-data";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { loadPeopleLite, loadPersonNamesById } from "@/features/people/lookup";
import { averagePercent } from "@/features/students/schemas";
import { scoreAverage } from "@/lib/angola-academic";
import { listSgaTermGrades } from "./sga-grades";
import {
  getStudentAcademicHistoryInputSchema,
  getTeacherWorkspaceInputSchema,
  listAssessmentsInputSchema,
  deleteAssessmentInputSchema,
  listPedagogicalWorkspaceInputSchema,
  listTermGradesInputSchema,
} from "./schemas";
import * as legacy from "./server-legacy";

export type {
  PedagogicalWorkspace,
  ProgramCurriculumEntry,
  ScheduleSlotSummary,
  StudentAcademicHistoryYear,
} from "./server-legacy";

// Escritas estruturais continuam na implementação existente. A segurança das
// escritas de professor é reforçada no PostgreSQL pelos guards/triggers da
// migration 20260903; esta fachada concentra o endurecimento das leituras.
export {
  addProgramSubject,
  applyCurriculumToClassGroup,
  assignClassSubjectTeacher,
  createAssessment,
  createClassGroup,
  createSubject,
  deactivateSubject,
  deleteClassGroup,
  ensureAcademicDefaults,
  removeProgramSubject,
  unassignClassSubjectTeacher,
  updateAssessmentItem,
  updateClassGroup,
  updateProgramGradingProfile,
  updateSubject,
  upsertAssessmentScores,
  upsertTermGrade,
  upsertTermGradesBatch,
  listProgramCurriculum,
} from "./server-legacy";

type Membership = NonNullable<Awaited<ReturnType<typeof resolveSgaMembershipAdmin>>>;
type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

type TeacherAssignment = {
  id: string;
  class_group_id: string;
  subject_id: string;
  teacher_id: string;
  weekly_periods: number | null;
};

type TeacherScope = {
  teacherId: string | null;
  teacherName: string;
  assignments: TeacherAssignment[];
  classGroupIds: string[];
  subjectIds: string[];
  classSubjectIds: string[];
  pairKeys: Set<string>;
};

function pairKey(classGroupId: unknown, subjectId: unknown) {
  return `${String(classGroupId ?? "")}:${String(subjectId ?? "")}`;
}

function isAcademicManager(membership: Membership) {
  const roles = membership.allAppRoles ?? [membership.appRole];
  return roles.includes("Administrador") || roles.includes("Secretaria");
}

function isTeacherOnly(membership: Membership) {
  const roles = membership.allAppRoles ?? [membership.appRole];
  return roles.includes("Professor") && !isAcademicManager(membership);
}

async function resolveTeacherScope(
  db: Db,
  schoolId: string,
  userId: string,
): Promise<TeacherScope> {
  let teacherId: string | null = null;
  let teacherName = "";

  const byUser = await db
    .from("teachers")
    .select("id, person_id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!byUser.error && byUser.data?.id) {
    teacherId = String(byUser.data.id);
    if (byUser.data.person_id) {
      const { data: person } = await db
        .from("people")
        .select("full_name")
        .eq("school_id", schoolId)
        .eq("id", byUser.data.person_id)
        .maybeSingle();
      teacherName = String(person?.full_name ?? "");
    }
  }

  // Compatibilidade com dados antigos onde teachers.user_id ainda não foi
  // preenchido: resolver pela pessoa ligada ao email/nome do utilizador.
  if (!teacherId) {
    let email = "";
    let fullName = "";
    try {
      const { data: authUser } = await db.auth.admin.getUserById(userId);
      email = String(authUser.user?.email ?? "")
        .trim()
        .toLowerCase();
      fullName = String(authUser.user?.user_metadata?.["full_name"] ?? "").trim();
    } catch {
      // Falha fechada: se não conseguirmos provar a identidade docente, não
      // devolvemos atribuições académicas.
    }

    if (email || fullName) {
      const { data: people, error: peopleError } = await db
        .from("people")
        .select("id, full_name, email")
        .eq("school_id", schoolId)
        .eq("status", "active");
      if (peopleError) {
        throw publicDatabaseError(peopleError, "Não foi possível validar o perfil do professor.");
      }
      const person =
        (people ?? []).find(
          (row) =>
            email &&
            String(row.email ?? "")
              .trim()
              .toLowerCase() === email,
        ) ??
        (people ?? []).find(
          (row) =>
            fullName &&
            String(row.full_name ?? "")
              .trim()
              .toLowerCase() === fullName.toLowerCase(),
        );
      if (person?.id) {
        const { data: teacher, error: teacherError } = await db
          .from("teachers")
          .select("id")
          .eq("school_id", schoolId)
          .eq("person_id", person.id)
          .eq("status", "active")
          .maybeSingle();
        if (teacherError) {
          throw publicDatabaseError(teacherError, "Não foi possível validar o professor.");
        }
        teacherId = teacher?.id ? String(teacher.id) : null;
        teacherName = String(person.full_name ?? "");
      }
    }
  }

  if (!teacherId) {
    return {
      teacherId: null,
      teacherName,
      assignments: [],
      classGroupIds: [],
      subjectIds: [],
      classSubjectIds: [],
      pairKeys: new Set(),
    };
  }

  const { data: assignmentRows, error: assignmentError } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id, weekly_periods")
    .eq("school_id", schoolId)
    .eq("teacher_id", teacherId)
    .eq("status", "active");
  if (assignmentError) {
    throw publicDatabaseError(
      assignmentError,
      "Não foi possível carregar as turmas atribuídas ao professor.",
    );
  }

  const assignments = (assignmentRows ?? []).map((row) => ({
    id: String(row.id),
    class_group_id: String(row.class_group_id),
    subject_id: String(row.subject_id),
    teacher_id: String(row.teacher_id),
    weekly_periods: row.weekly_periods == null ? null : Number(row.weekly_periods),
  }));
  const classGroupIds = [...new Set(assignments.map((row) => row.class_group_id))];
  const subjectIds = [...new Set(assignments.map((row) => row.subject_id))];
  const classSubjectIds = assignments.map((row) => row.id);

  return {
    teacherId,
    teacherName,
    assignments,
    classGroupIds,
    subjectIds,
    classSubjectIds,
    pairKeys: new Set(assignments.map((row) => pairKey(row.class_group_id, row.subject_id))),
  };
}

async function requireAcademicMembership(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem membership activa nesta escola.");
  if (
    !isAcademicManager(membership) &&
    !(membership.allAppRoles ?? [membership.appRole]).includes("Professor")
  ) {
    throw new Error("Sem permissão para consultar dados pedagógicos.");
  }
  return membership;
}

async function buildTeacherWorkspace(db: Db, membership: Membership, userId: string) {
  const scope = await resolveTeacherScope(db, membership.schoolId, userId);
  if (!scope.teacherId || scope.assignments.length === 0) {
    return {
      teacherId: scope.teacherId,
      teacherName: scope.teacherName,
      classes: [],
      enrollments: [],
      schedule: [],
    };
  }

  const [{ data: groups, error: groupsError }, { data: subjects, error: subjectsError }] =
    await Promise.all([
      db
        .from("class_groups")
        .select("id, name, grade_level_id, academic_year_id")
        .eq("school_id", membership.schoolId)
        .in("id", scope.classGroupIds),
      db
        .from("subjects")
        .select("id, name")
        .eq("school_id", membership.schoolId)
        .in("id", scope.subjectIds),
    ]);
  if (groupsError) throw publicDatabaseError(groupsError, "Não foi possível carregar as turmas.");
  if (subjectsError)
    throw publicDatabaseError(subjectsError, "Não foi possível carregar as disciplinas.");

  const { data: enrollments, error: enrollmentError } = await db
    .from("enrollments")
    .select("id, student_id, class_group_id, status")
    .eq("school_id", membership.schoolId)
    .in("class_group_id", scope.classGroupIds)
    .eq("status", "active");
  if (enrollmentError) {
    throw publicDatabaseError(enrollmentError, "Não foi possível carregar os alunos das turmas.");
  }

  const { data: slots, error: slotsError } = scope.classSubjectIds.length
    ? await db
        .from("timetable_slots")
        .select("id, class_subject_id, weekday, starts_at, ends_at")
        .eq("school_id", membership.schoolId)
        .in("class_subject_id", scope.classSubjectIds)
        .eq("status", "active")
        .order("weekday")
        .order("starts_at")
    : { data: [], error: null };
  if (slotsError) throw publicDatabaseError(slotsError, "Não foi possível carregar o horário.");

  const gradeIds = [
    ...new Set((groups ?? []).map((row) => String(row.grade_level_id ?? "")).filter(Boolean)),
  ];
  const { data: gradeRows, error: gradeError } = gradeIds.length
    ? await db.from("grade_levels").select("id, name, program_id").in("id", gradeIds)
    : { data: [], error: null };
  if (gradeError) throw publicDatabaseError(gradeError, "Não foi possível carregar as classes.");

  const programIds = [
    ...new Set((gradeRows ?? []).map((row) => String(row.program_id ?? "")).filter(Boolean)),
  ];
  const { data: programs, error: programError } = programIds.length
    ? await db.from("programs").select("id, name").in("id", programIds)
    : { data: [], error: null };
  if (programError) throw publicDatabaseError(programError, "Não foi possível carregar os cursos.");

  const studentIds = [...new Set((enrollments ?? []).map((row) => String(row.student_id)))];
  const { data: studentRows, error: studentError } = studentIds.length
    ? await db.from("students").select("id, person_id").in("id", studentIds)
    : { data: [], error: null };
  if (studentError) throw publicDatabaseError(studentError, "Não foi possível carregar os alunos.");
  const personIds = [...new Set((studentRows ?? []).map((row) => String(row.person_id)))];
  const personNameById = await loadPersonNamesById(db, membership.schoolId, personIds);

  const groupById = new Map((groups ?? []).map((row) => [String(row.id), row]));
  const subjectById = new Map((subjects ?? []).map((row) => [String(row.id), String(row.name)]));
  const gradeById = new Map((gradeRows ?? []).map((row) => [String(row.id), row]));
  const programById = new Map((programs ?? []).map((row) => [String(row.id), String(row.name)]));
  const assignmentById = new Map(scope.assignments.map((row) => [row.id, row]));
  const studentNameById = new Map(
    (studentRows ?? []).map((row) => [
      String(row.id),
      personNameById.get(String(row.person_id)) ?? "Aluno",
    ]),
  );
  const enrollmentCountByClass = new Map<string, number>();
  for (const enrollment of enrollments ?? []) {
    const groupId = String(enrollment.class_group_id);
    enrollmentCountByClass.set(groupId, (enrollmentCountByClass.get(groupId) ?? 0) + 1);
  }

  const classes = scope.assignments.map((assignment) => {
    const group = groupById.get(assignment.class_group_id);
    const grade = group?.grade_level_id ? gradeById.get(String(group.grade_level_id)) : undefined;
    return {
      id: assignment.class_group_id,
      name: String(group?.name ?? "Turma"),
      grade_name: String(grade?.name ?? "Classe"),
      course_name: grade?.program_id ? (programById.get(String(grade.program_id)) ?? "—") : "—",
      subject_id: assignment.subject_id,
      subject_name: subjectById.get(assignment.subject_id) ?? "Disciplina",
      enrolled_count: enrollmentCountByClass.get(assignment.class_group_id) ?? 0,
    };
  });

  const enrollmentRows = (enrollments ?? []).flatMap((row) => {
    const assignments = scope.assignments.filter(
      (assignment) => assignment.class_group_id === String(row.class_group_id),
    );
    return assignments.map((assignment) => ({
      id: String(row.id),
      student_id: String(row.student_id),
      student_name: studentNameById.get(String(row.student_id)) ?? "Aluno",
      class_group_name: String(groupById.get(String(row.class_group_id))?.name ?? "Turma"),
      subject_name: subjectById.get(assignment.subject_id) ?? "Disciplina",
    }));
  });

  const schedule = (slots ?? []).map((slot) => {
    const assignment = assignmentById.get(String(slot.class_subject_id));
    const weekday = Number(slot.weekday);
    const weekdayLabels = [
      "",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ];
    return {
      id: String(slot.id),
      weekday,
      weekday_label: weekdayLabels[weekday] ?? `Dia ${weekday}`,
      starts_at: String(slot.starts_at).slice(0, 5),
      ends_at: String(slot.ends_at).slice(0, 5),
      subject_name: assignment
        ? (subjectById.get(assignment.subject_id) ?? "Disciplina")
        : "Disciplina",
      class_group_name: assignment
        ? String(groupById.get(assignment.class_group_id)?.name ?? "Turma")
        : "Turma",
    };
  });

  return {
    teacherId: scope.teacherId,
    teacherName: scope.teacherName,
    classes,
    enrollments: enrollmentRows,
    schedule,
  };
}

export const getTeacherWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getTeacherWorkspaceInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireAcademicMembership(context.userId);

    // Professor sem cargo de gestão nunca pode seleccionar outro teacherId.
    if (!isTeacherOnly(membership)) {
      return legacy.getTeacherWorkspace({ data });
    }

    const db = await loadSgaAdminClient();
    return buildTeacherWorkspace(db, membership, context.userId);
  });

export const listTermGrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listTermGradesInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireAcademicMembership(context.userId);
    if (!isTeacherOnly(membership)) return legacy.listTermGrades({ data });

    const db = await loadSgaAdminClient();
    const scope = await resolveTeacherScope(db, membership.schoolId, context.userId);
    if (!scope.teacherId || scope.classGroupIds.length === 0) return [];

    const { data: enrollments, error: enrollmentError } = await db
      .from("enrollments")
      .select("id, class_group_id")
      .eq("school_id", membership.schoolId)
      .in("class_group_id", scope.classGroupIds)
      .in("status", ["active", "pending"]);
    if (enrollmentError) {
      throw publicDatabaseError(
        enrollmentError,
        "Não foi possível validar as matrículas do professor.",
      );
    }
    const enrollmentClassById = new Map(
      (enrollments ?? []).map((row) => [String(row.id), String(row.class_group_id)]),
    );
    const enrollmentIds = [...enrollmentClassById.keys()];
    if (enrollmentIds.length === 0) return [];

    const rows = await listSgaTermGrades({
      db,
      schoolId: membership.schoolId,
      enrollmentIds,
      limit: data.limit,
    });

    return rows
      .filter((row) => {
        const classGroupId = enrollmentClassById.get(row.enrollment_id) ?? row.class_group_id;
        return (
          scope.pairKeys.has(pairKey(classGroupId, row.subject_id)) &&
          (data.term ? row.term === data.term : true)
        );
      })
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

export const listAssessments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAssessmentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireAcademicMembership(context.userId);
    if (!isTeacherOnly(membership)) return legacy.listAssessments({ data });

    const db = await loadSgaAdminClient();
    const scope = await resolveTeacherScope(db, membership.schoolId, context.userId);
    if (!scope.teacherId || scope.assignments.length === 0) {
      return { available: true, items: [], scores: [] };
    }

    let query = db
      .from("siga_assessment_items")
      .select(
        "id, class_group_id, subject_id, term, name, kind, component, assessed_on, starts_at, duration_minutes, purpose, max_score, counts_toward_pauta, allow_recovery, description, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .order("assessed_on", { ascending: true });
    if (data.classGroupId) query = query.eq("class_group_id", data.classGroupId);
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);
    if (data.term) query = query.eq("term", data.term);
    const { data: itemRows, error } = await query;
    if (error) {
      if (/schema cache|does not exist|42P01|PGRST/i.test(error.message)) {
        return { available: false, items: [], scores: [] };
      }
      throw publicDatabaseError(error, "Não foi possível carregar as avaliações.");
    }

    const items = (itemRows ?? []).filter((item) =>
      scope.pairKeys.has(pairKey(item.class_group_id, item.subject_id)),
    );
    const itemIds = items.map((item) => String(item.id));
    const { data: scores, error: scoreError } = itemIds.length
      ? await db
          .from("siga_assessment_scores")
          .select("id, item_id, enrollment_id, score, previous_score, updated_at")
          .eq("school_id", membership.schoolId)
          .in("item_id", itemIds)
      : { data: [], error: null };
    if (scoreError) {
      throw publicDatabaseError(scoreError, "Não foi possível carregar as notas das avaliações.");
    }
    return { available: true, items, scores: scores ?? [] };
  });

export const deleteAssessmentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteAssessmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireAcademicMembership(context.userId);
    const db = await loadSgaAdminClient();

    if (isTeacherOnly(membership)) {
      const scope = await resolveTeacherScope(db, membership.schoolId, context.userId);
      if (!scope.teacherId) {
        throw new Error("Perfil de professor não associado a esta escola.");
      }
      const { data: item, error: itemError } = await db
        .from("siga_assessment_items")
        .select("id, class_group_id, subject_id")
        .eq("id", data.itemId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (itemError) {
        throw publicDatabaseError(itemError, "Não foi possível validar a avaliação.");
      }
      if (!item) throw new Error("Avaliação não encontrada nesta escola.");
      if (!scope.pairKeys.has(pairKey(item.class_group_id, item.subject_id))) {
        throw new Error(
          "O professor só pode eliminar avaliações da sua turma e disciplina atribuídas.",
        );
      }
    }

    const { data: deletedCount, error } = await db.rpc("delete_sga_assessment_item", {
      p_school_id: membership.schoolId,
      p_item_id: data.itemId,
      p_actor_id: context.userId,
      p_force: data.force,
    });
    if (error) {
      throw publicDatabaseError(error, "Não foi possível eliminar a avaliação.");
    }
    return { success: true, deletedScoresCount: Number(deletedCount ?? 0) };
  });

export const getStudentAcademicHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getStudentAcademicHistoryInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireAcademicMembership(context.userId);
    if (!isTeacherOnly(membership)) return legacy.getStudentAcademicHistory({ data });

    // O histórico multi-ano contém informação de disciplinas e anos que podem
    // não ter qualquer relação com o professor actual. Falha fechada: o professor
    // usa o diário/pauta da sua atribuição; histórico completo é Direcção/Secretaria.
    throw new Error(
      "O professor pode consultar apenas o desempenho das turmas e disciplinas que lhe foram atribuídas. O histórico académico completo é reservado à Direcção/Secretaria.",
    );
  });

export const listPedagogicalWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listPedagogicalWorkspaceInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<legacy.PedagogicalWorkspace> => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireAcademicMembership(context.userId);
    if (!isTeacherOnly(membership)) {
      return legacy.listPedagogicalWorkspace({ data }) as Promise<legacy.PedagogicalWorkspace>;
    }

    const db = await loadSgaAdminClient();
    const scope = await resolveTeacherScope(db, membership.schoolId, context.userId);
    const yearFilter = data.academicYearId;

    const { data: years, error: yearsError } = await db
      .from("academic_years")
      // `academic_years` não tem `code` — com ela no select o PostgREST recusa
      // a consulta, e o `throw` abaixo fazia este endpoint falhar sempre. O
      // `code` devolvido já usava o nome como alternativa; passa a usá-lo só.
      .select("id, name, starts_on")
      .eq("school_id", membership.schoolId)
      .order("starts_on", { ascending: false });
    if (yearsError) {
      throw publicDatabaseError(yearsError, "Não foi possível carregar os anos lectivos.");
    }

    if (!scope.teacherId || scope.assignments.length === 0) {
      return {
        academicYears: (years ?? []).map((row) => ({
          id: String(row.id),
          name: String(row.name ?? ""),
          code: String(row.name ?? ""),
        })),
        courses: [],
        gradeLevels: [],
        rooms: [],
        classGroups: [],
        subjects: [],
        classSubjects: [],
        termGrades: [],
        enrollmentOptions: [],
        scheduleSlots: [],
        subjectsAvailable: true,
        gradesAvailable: true,
        scheduleAvailable: true,
      };
    }

    const { data: rawGroups, error: groupsError } = await db
      .from("class_groups")
      .select("*")
      .eq("school_id", membership.schoolId)
      .in("id", scope.classGroupIds)
      .eq("status", "active");
    if (groupsError) throw publicDatabaseError(groupsError, "Não foi possível carregar as turmas.");
    const groups = (rawGroups ?? []).filter((group) =>
      yearFilter ? String(group.academic_year_id) === yearFilter : true,
    );
    const visibleGroupIds = groups.map((group) => String(group.id));
    const visibleGroupSet = new Set(visibleGroupIds);
    const assignments = scope.assignments.filter((assignment) =>
      visibleGroupSet.has(assignment.class_group_id),
    );
    const visibleSubjectIds = [...new Set(assignments.map((assignment) => assignment.subject_id))];
    const visibleClassSubjectIds = assignments.map((assignment) => assignment.id);
    const visiblePairKeys = new Set(
      assignments.map((assignment) => pairKey(assignment.class_group_id, assignment.subject_id)),
    );

    const [
      { data: subjects, error: subjectsError },
      { data: enrollments, error: enrollmentsError },
    ] = await Promise.all([
      visibleSubjectIds.length
        ? db
            .from("subjects")
            .select("*")
            .eq("school_id", membership.schoolId)
            .in("id", visibleSubjectIds)
            .neq("status", "inactive")
            .order("name")
        : Promise.resolve({ data: [], error: null }),
      visibleGroupIds.length
        ? db
            .from("enrollments")
            .select("id, class_group_id, student_id, status, attendance_rate")
            .eq("school_id", membership.schoolId)
            .in("class_group_id", visibleGroupIds)
            .in("status", ["active", "pending"])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (subjectsError)
      throw publicDatabaseError(subjectsError, "Não foi possível carregar as disciplinas.");
    if (enrollmentsError)
      throw publicDatabaseError(enrollmentsError, "Não foi possível carregar as matrículas.");

    const gradeLevelIds = [
      ...new Set(groups.map((group) => String(group.grade_level_id ?? "")).filter(Boolean)),
    ];
    const campusIds = [
      ...new Set(groups.map((group) => String(group.campus_id ?? "")).filter(Boolean)),
    ];
    const roomIds = [
      ...new Set(groups.map((group) => String(group.room_id ?? "")).filter(Boolean)),
    ];
    const [
      { data: gradeLevels, error: gradeError },
      { data: campuses, error: campusError },
      { data: salas },
    ] = await Promise.all([
      gradeLevelIds.length
        ? db.from("grade_levels").select("*").in("id", gradeLevelIds)
        : Promise.resolve({ data: [], error: null }),
      campusIds.length
        ? db.from("campuses").select("*").in("id", campusIds)
        : Promise.resolve({ data: [], error: null }),
      roomIds.length
        ? db.from("rooms").select("id, name").in("id", roomIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    ]);
    if (gradeError) throw publicDatabaseError(gradeError, "Não foi possível carregar as classes.");
    if (campusError) throw publicDatabaseError(campusError, "Não foi possível carregar as salas.");

    const programIds = [
      ...new Set((gradeLevels ?? []).map((row) => String(row.program_id ?? "")).filter(Boolean)),
    ];
    const { data: programs, error: programError } = programIds.length
      ? await db.from("programs").select("*").in("id", programIds)
      : { data: [], error: null };
    if (programError)
      throw publicDatabaseError(programError, "Não foi possível carregar os cursos.");

    const { data: timetableSlots, error: scheduleError } = visibleClassSubjectIds.length
      ? await db
          .from("timetable_slots")
          .select("id, class_subject_id, weekday, starts_at, ends_at, room, room_id, notes, status")
          .eq("school_id", membership.schoolId)
          .in("class_subject_id", visibleClassSubjectIds)
          .eq("status", "active")
          .order("starts_at")
          .limit(500)
      : { data: [], error: null };
    if (scheduleError) {
      throw publicDatabaseError(scheduleError, "Não foi possível carregar o horário do professor.");
    }

    const enrollmentClassById = new Map(
      (enrollments ?? []).map((row) => [String(row.id), String(row.class_group_id)]),
    );
    const enrollmentIds = [...enrollmentClassById.keys()];
    let rawTermGrades: Awaited<ReturnType<typeof listSgaTermGrades>> = [];
    if (enrollmentIds.length) {
      rawTermGrades = await listSgaTermGrades({
        db,
        schoolId: membership.schoolId,
        enrollmentIds,
        limit: 600,
      });
    }
    const termGradeRows = rawTermGrades.filter((grade) => {
      const classGroupId = enrollmentClassById.get(grade.enrollment_id) ?? grade.class_group_id;
      return visiblePairKeys.has(pairKey(classGroupId, grade.subject_id));
    });

    const studentIds = [...new Set((enrollments ?? []).map((row) => String(row.student_id)))];
    const { data: studentRows, error: studentError } = studentIds.length
      ? await db.from("students").select("id, student_number, person_id").in("id", studentIds)
      : { data: [], error: null };
    if (studentError)
      throw publicDatabaseError(studentError, "Não foi possível carregar os alunos.");
    const personIds = [...new Set((studentRows ?? []).map((row) => String(row.person_id)))];
    const peopleById = await loadPeopleLite(db, membership.schoolId, personIds);
    const studentsById = new Map(
      (studentRows ?? []).map((student) => {
        const person = peopleById.get(String(student.person_id));
        return [
          String(student.id),
          {
            id: String(student.id),
            full_name: person?.full_name ?? "—",
            registration_number: String(student.student_number ?? ""),
            photo_url: person?.photo_url ?? null,
            sex: person?.sex ?? null,
          },
        ] as const;
      }),
    );

    const yearById = new Map((years ?? []).map((row) => [String(row.id), row]));
    const programById = new Map((programs ?? []).map((row) => [String(row.id), row]));
    const gradeById = new Map((gradeLevels ?? []).map((row) => [String(row.id), row]));
    const campusById = new Map((campuses ?? []).map((row) => [String(row.id), row]));
    const salaNameById = new Map((salas ?? []).map((row) => [String(row.id), String(row.name)]));
    const groupById = new Map(groups.map((row) => [String(row.id), row]));
    const subjectById = new Map((subjects ?? []).map((row) => [String(row.id), row]));
    const assignmentById = new Map(assignments.map((row) => [row.id, row]));

    const enrollmentStats = new Map<string, { count: number; rates: number[] }>();
    for (const enrollment of enrollments ?? []) {
      const classGroupId = String(enrollment.class_group_id);
      const current = enrollmentStats.get(classGroupId) ?? { count: 0, rates: [] };
      current.count += 1;
      const rate = Number(enrollment.attendance_rate);
      if (Number.isFinite(rate)) current.rates.push(rate);
      enrollmentStats.set(classGroupId, current);
    }

    // Média real por turma calculada a partir das notas por período.
    const gradeAveragesByGroup = new Map<string, number[]>();
    for (const row of termGradeRows) {
      const groupId =
        enrollmentClassById.get(row.enrollment_id) ??
        (row.class_group_id ? String(row.class_group_id) : null);
      const average = scoreAverage(row.mac, row.npp, row.npt);
      if (!groupId || !Number.isFinite(average) || average <= 0) continue;
      const bucket = gradeAveragesByGroup.get(groupId) ?? [];
      bucket.push(average);
      gradeAveragesByGroup.set(groupId, bucket);
    }
    const classAverage = (groupId: string) => {
      const values = gradeAveragesByGroup.get(groupId);
      if (!values?.length) return null;
      const sum = values.reduce((total, value) => total + value, 0);
      return Math.round((sum / values.length) * 10) / 10;
    };

    const classGroups = groups.map((group) => {
      const grade = gradeById.get(String(group.grade_level_id));
      const program = grade?.program_id ? programById.get(String(grade.program_id)) : undefined;
      const campus = group.campus_id ? campusById.get(String(group.campus_id)) : undefined;
      const year = yearById.get(String(group.academic_year_id));
      const stats = enrollmentStats.get(String(group.id));
      return {
        id: String(group.id),
        academic_year_id: group.academic_year_id ? String(group.academic_year_id) : null,
        name: String(group.name ?? ""),
        code: String(group.code ?? ""),
        shift: String(group.shift ?? ""),
        status: String(group.status ?? "active"),
        campus_id: group.campus_id ? String(group.campus_id) : null,
        capacity: Number.isFinite(Number(group.capacity)) ? Number(group.capacity) : null,
        whatsapp_invite_url: group.whatsapp_invite_url ? String(group.whatsapp_invite_url) : null,
        whatsapp_group_name: group.whatsapp_group_name ? String(group.whatsapp_group_name) : null,
        course_id: program ? String(program.id ?? "") : null,
        course_name: String(program?.name ?? "—"),
        grade_name: String(grade?.name ?? "—"),
        // Sala física (`rooms`). Até 29/09 este campo levava o nome do campus.
        room_id: group.room_id ? String(group.room_id) : null,
        room_name: (group.room_id && salaNameById.get(String(group.room_id))) || "—",
        campus_name: String(campus?.name ?? "—"),
        academic_year_name: String(year?.name ?? "—"),
        enrolled_count: stats?.count ?? 0,
        average_score: classAverage(String(group.id)),
        attendance_rate: averagePercent(stats?.rates ?? []),
      };
    });

    const enrollmentOptions = (enrollments ?? []).map((enrollment) => {
      const student = studentsById.get(String(enrollment.student_id));
      const group = groupById.get(String(enrollment.class_group_id));
      return {
        id: String(enrollment.id),
        label: `${student?.full_name ?? "Aluno"} · ${String(group?.name ?? "Turma")}`,
        student_id: student?.id ?? String(enrollment.student_id),
        student_name: student?.full_name ?? "—",
        student_photo_url: student?.photo_url ?? null,
        student_gender: student?.sex ?? null,
        registration_number: student?.registration_number ?? null,
        class_group_id: String(enrollment.class_group_id),
        class_group_name: String(group?.name ?? "—"),
      };
    });

    // Aprovação pela nota do modelo de avaliação em vigor, não por um 10 fixo.
    const passingValue = await loadActivePassingValue(db, membership.schoolId);
    const subjectPassRates = new Map<string, { pass: number; total: number }>();
    const termGrades = termGradeRows.map((grade) => {
      const enrollment = (enrollments ?? []).find((row) => String(row.id) === grade.enrollment_id);
      const student = enrollment ? studentsById.get(String(enrollment.student_id)) : undefined;
      const groupId = enrollmentClassById.get(grade.enrollment_id) ?? grade.class_group_id;
      const group = groupId ? groupById.get(String(groupId)) : undefined;
      const subject = subjectById.get(grade.subject_id);
      const average = scoreAverage(grade.mac, grade.npp, grade.npt);
      const stats = subjectPassRates.get(grade.subject_id) ?? { pass: 0, total: 0 };
      stats.total += 1;
      if (average >= passingValue) stats.pass += 1;
      subjectPassRates.set(grade.subject_id, stats);
      return {
        id: grade.id,
        enrollment_id: grade.enrollment_id,
        subject_id: grade.subject_id,
        term: grade.term,
        mac: grade.mac,
        npp: grade.npp,
        npt: grade.npt,
        average,
        student_id: student?.id ?? null,
        student_name: student?.full_name ?? "—",
        student_photo_url: student?.photo_url ?? null,
        registration_number: student?.registration_number ?? null,
        class_group_id: groupId ? String(groupId) : null,
        class_group_name: String(group?.name ?? "—"),
        subject_name: String(subject?.name ?? "—"),
        term_label: `${grade.term}º` as const,
        updated_at: grade.updated_at,
      };
    });

    const subjectRows = (subjects ?? []).map((subject) => {
      const stats = subjectPassRates.get(String(subject.id));
      // `subjects` não tem carga semanal nem classes: vêm das turmas atribuídas ao
      // professor (tempos lectivos em `class_subjects.weekly_periods`, classe pela
      // `sequence` de `grade_levels`). Antes lia colunas inexistentes e mostrava "—".
      const subjectAssignments = assignments.filter(
        (assignment) => assignment.subject_id === String(subject.id),
      );
      const weeklyPeriods = subjectAssignments.reduce(
        (total, assignment) => total + (assignment.weekly_periods ?? 0),
        0,
      );
      const gradeSequences = subjectAssignments
        .map((assignment) => groupById.get(assignment.class_group_id)?.grade_level_id)
        .map((gradeId) => (gradeId ? gradeById.get(String(gradeId))?.sequence : undefined))
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return {
        id: String(subject.id),
        name: String(subject.name ?? ""),
        code: String(subject.code ?? ""),
        teacher_name: scope.teacherName || null,
        weekly_hours: weeklyPeriods,
        grade_from: gradeSequences.length ? Math.min(...gradeSequences) : null,
        grade_to: gradeSequences.length ? Math.max(...gradeSequences) : null,
        classes_label:
          assignments
            .filter((assignment) => assignment.subject_id === String(subject.id))
            .map((assignment) => String(groupById.get(assignment.class_group_id)?.name ?? "Turma"))
            .join(", ") || "—",
        weekly_hours_label: weeklyPeriods ? `${weeklyPeriods} tempos/semana` : "—",
        approval_rate:
          stats && stats.total > 0 ? Math.round((stats.pass / stats.total) * 100) : null,
      };
    });

    const classSubjects = assignments.map((assignment) => ({
      class_group_id: assignment.class_group_id,
      subject_id: assignment.subject_id,
      // Sem a carga semanal, a verificacao de publicacao nao tem com o que comparar
      // e deixa passar um horario incompleto na vista do docente.
      weekly_periods: assignment.weekly_periods ?? null,
      subject_name: String(subjectById.get(assignment.subject_id)?.name ?? "Disciplina"),
      teacher_id: scope.teacherId,
      teacher_name: scope.teacherName || null,
    }));

    const scheduleSlots = (timetableSlots ?? []).map((slot) => {
      const assignment = assignmentById.get(String(slot.class_subject_id));
      const subject = assignment ? subjectById.get(assignment.subject_id) : undefined;
      const group = assignment ? groupById.get(assignment.class_group_id) : undefined;
      return {
        id: String(slot.id),
        class_group_id: assignment?.class_group_id ?? null,
        weekday: Number(slot.weekday ?? 0),
        starts_at: String(slot.starts_at ?? ""),
        ends_at: String(slot.ends_at ?? ""),
        subject_id: assignment?.subject_id ?? null,
        teacher_id: scope.teacherId,
        // Os mesmos campos que `server-legacy` devolve: a vista do docente e a da
        // secretaria leem o mesmo tipo e nao podem divergir na sala nem nas notas.
        room_id: slot.room_id ? String(slot.room_id) : null,
        room_name: slot.room ? String(slot.room) : null,
        label: slot.room ? String(slot.room) : null,
        notes: slot.notes ? String(slot.notes) : null,
        subject_name: subject?.name ? String(subject.name) : null,
        display_label: String(subject?.name ?? slot.room ?? "—"),
        class_group_name: String(group?.name ?? "—"),
      };
    });

    const visibleYearIds = new Set(groups.map((group) => String(group.academic_year_id)));
    const academicYears = (years ?? [])
      .filter((year) => visibleYearIds.has(String(year.id)) || String(year.id) === yearFilter)
      .map((year) => ({
        id: String(year.id),
        name: String(year.name ?? ""),
        code: String(year.name ?? ""),
      }));

    return {
      academicYears,
      courses: (programs ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        code: String(row.code ?? row.name ?? ""),
      })),
      gradeLevels: (gradeLevels ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        code: String(row.code ?? row.name ?? ""),
      })),
      rooms: (campuses ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        code: String(row.code ?? row.name ?? ""),
      })),
      classGroups,
      subjects: subjectRows,
      classSubjects,
      termGrades,
      enrollmentOptions,
      scheduleSlots,
      subjectsAvailable: true,
      gradesAvailable: true,
      scheduleAvailable: true,
    };
  });
