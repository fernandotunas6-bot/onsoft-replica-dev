import { createServerFn } from "@tanstack/react-start";
import {
  type SupabaseAuthContext,
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { requireAal2 } from "@/features/hr/require-aal2";
import { ownTeacherId } from "@/features/academic/own-teacher";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import {
  type AgendaRange,
  agendaRangeSchema,
  saveAgendaEventSchema,
  cancelAgendaEventSchema,
} from "./agenda-schemas";
import {
  buildAcademicAgenda,
  type AgendaAccess,
  type AgendaData,
  type AgendaEvent,
} from "./agenda";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Result<T> = { data: T[] | null; error: { message: string } | null };
/** Page every source; a partial agenda must never look like a complete agenda. */
async function rows<T>(query: {
  range: (from: number, to: number) => PromiseLike<Result<T>>;
}): Promise<T[]> {
  const output: T[] = [];
  for (let offset = 0; offset < 20_000; offset += 500) {
    const result = await query.range(offset, offset + 499);
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível carregar a agenda académica.");
    output.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return output;
  }
  throw new Error("Agenda demasiado extensa; seleccione uma turma ou um intervalo menor.");
}

async function studentAccess(
  db: Db,
  schoolId: string,
  studentId: string,
  yearIds: string[],
): Promise<AgendaAccess[]> {
  const [enrollments, units] = await Promise.all([
    rows(
      db
        .from("enrollments")
        .select("class_group_id, enrolled_on, ended_on, status")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .in("academic_year_id", yearIds)
        .in("status", ["active", "transferred", "completed"])
        .order("id"),
    ),
    rows(
      db
        .from("course_unit_enrollments")
        .select("class_group_id, program_subject_id, status")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .in("academic_year_id", yearIds)
        .order("id"),
    ),
  ]);
  const unitGroups = new Set(units.map((u) => u.class_group_id));
  const subjectIds = [
    ...new Set(units.filter((u) => u.status === "inscrito").map((u) => u.program_subject_id)),
  ];
  const subjects = subjectIds.length
    ? await rows(
        db
          .from("program_subjects")
          .select("id, subject_id")
          .eq("school_id", schoolId)
          .in("id", subjectIds)
          .order("id"),
      )
    : [];
  const subjectById = new Map(subjects.map((s) => [s.id, s.subject_id]));
  const access: AgendaAccess[] = enrollments
    .filter((e) => e.status === "active" || e.ended_on !== null)
    .filter((e) => !unitGroups.has(e.class_group_id))
    .map((e) => ({
      classGroupId: e.class_group_id,
      startsOn: e.enrolled_on,
      endsOn: e.ended_on ?? "9999-12-31",
    }));
  for (const unit of units) {
    const subjectId = subjectById.get(unit.program_subject_id);
    if (unit.status !== "inscrito" || !unit.class_group_id || !subjectId) continue;
    const enrollment = enrollments.find((e) => e.class_group_id === unit.class_group_id);
    access.push({
      classGroupId: unit.class_group_id,
      subjectId,
      startsOn: enrollment?.enrolled_on ?? "0001-01-01",
      endsOn: enrollment?.ended_on ?? "9999-12-31",
    });
  }
  return access;
}

export async function loadAcademicAgendaForRequest(
  data: AgendaRange,
  context: Pick<SupabaseAuthContext, "supabase" | "userId">,
): Promise<AgendaEvent[]> {
  data = agendaRangeSchema.parse(data);
  const membership = await resolveSgaMembershipAdmin(context.userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  const roles = membership.allAppRoles ?? [membership.appRole];
  const manager = roles.some((r) => ["Administrador", "Secretaria"].includes(r));
  const schoolViewer = manager || roles.includes("Tesouraria");
  const staff = schoolViewer || roles.includes("Professor");
  if (staff)
    await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
      "Tesouraria",
    ]);
  const db = await loadSgaAdminClient(),
    schoolId = membership.schoolId;
  let teacherId: string | undefined;
  if (!schoolViewer && staff) {
    teacherId = (await ownTeacherId(db, schoolId, context.userId)) ?? undefined;
    if (!teacherId || (data.teacherId && data.teacherId !== teacherId))
      throw new Error("Sem acesso ao horário deste docente.");
  }
  const visible = staff ? null : await resolveVisibleStudent(context.userId, data.studentId);
  if (!staff && (!visible || visible.schoolId !== schoolId))
    throw new Error("Sem acesso à agenda deste estudante.");
  if (!staff && data.teacherId) throw new Error("Filtro de docente indisponível nesta agenda.");
  let yearQuery = db
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .lt("starts_on", data.end)
    .gte("ends_on", data.start)
    .order("id");
  if (data.academicYearId) yearQuery = yearQuery.eq("id", data.academicYearId);
  const years = await rows(yearQuery),
    yearIds = years.map((y) => y.id);
  if (!yearIds.length) return [];
  const access = visible
    ? await studentAccess(db, schoolId, visible.studentId, yearIds)
    : undefined;
  let groupQuery = db
    .from("class_groups")
    .select("id, name, academic_year_id")
    .eq("school_id", schoolId)
    .in("academic_year_id", yearIds)
    .order("id");
  if (data.classGroupId) groupQuery = groupQuery.eq("id", data.classGroupId);
  if (access) {
    const groupIds = [...new Set(access.map((a) => a.classGroupId))];
    if (!groupIds.length) return [];
    groupQuery = groupQuery.in("id", groupIds);
  }
  const groups = await rows(groupQuery),
    groupIds = groups.map((g) => g.id);
  let assignments: AgendaData["assignments"] = [];
  if (groupIds.length) {
    let query = db
      .from("class_subjects")
      .select("id, class_group_id, subject_id, teacher_id")
      .eq("school_id", schoolId)
      .in("class_group_id", groupIds)
      .eq("status", "active")
      .order("id");
    if (teacherId ?? data.teacherId) query = query.eq("teacher_id", teacherId ?? data.teacherId!);
    assignments = await rows(query);
  }
  const assignmentIds = assignments.map((a) => a.id),
    subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const teacherIds = [
    ...new Set(assignments.map((a) => a.teacher_id).filter((id): id is string => !!id)),
  ];
  const scopedGroupIds = [...new Set(assignments.map((a) => a.class_group_id))];
  const [terms, calendar, schedules, slots, subjects, assessments, tasks, teacherRows] =
    await Promise.all([
      rows(
        db
          .from("terms")
          .select("id, academic_year_id, name, sequence, starts_on, ends_on")
          .eq("school_id", schoolId)
          .in("academic_year_id", yearIds)
          .order("id"),
      ),
      rows(
        db
          .from("siga_calendar_events")
          .select(
            "id, academic_year_id, class_group_id, teacher_id, title, description, category, starts_on, ends_on, starts_at, ends_at, audience, blocks_teaching, version",
          )
          .eq("school_id", schoolId)
          .in("academic_year_id", yearIds)
          .eq("status", "published")
          .lt("starts_on", data.end)
          .gte("ends_on", data.start)
          .order("id"),
      ),
      scopedGroupIds.length
        ? rows(
            db
              .from("academic_schedules")
              .select("id, academic_year_id, class_group_id, status, valid_from, valid_to, term")
              .eq("school_id", schoolId)
              .in("class_group_id", scopedGroupIds)
              .in("academic_year_id", yearIds)
              .eq("status", "published")
              .is("deleted_at", null)
              .order("id"),
          )
        : [],
      assignmentIds.length
        ? rows(
            db
              .from("timetable_slots")
              .select("id, class_subject_id, schedule_id, weekday, starts_at, ends_at, room")
              .eq("school_id", schoolId)
              .in("class_subject_id", assignmentIds)
              .eq("status", "active")
              .order("id"),
          )
        : [],
      subjectIds.length
        ? rows(
            db
              .from("subjects")
              .select("id, name")
              .eq("school_id", schoolId)
              .in("id", subjectIds)
              .order("id"),
          )
        : [],
      scopedGroupIds.length
        ? rows(
            db
              .from("siga_assessment_items")
              .select(
                "id, class_group_id, subject_id, name, assessed_on, starts_at, duration_minutes, purpose",
              )
              .eq("school_id", schoolId)
              .in("class_group_id", scopedGroupIds)
              .gte("assessed_on", data.start)
              .lt("assessed_on", data.end)
              .order("id"),
          )
        : [],
      assignmentIds.length
        ? rows(
            db
              .from("siga_class_tasks")
              .select("id, class_subject_id, title, due_on, kind")
              .eq("school_id", schoolId)
              .in("class_subject_id", assignmentIds)
              .eq("status", "published")
              .gte("due_on", data.start)
              .lt("due_on", data.end)
              .order("id"),
          )
        : [],
      teacherIds.length
        ? rows(
            db
              .from("teachers")
              .select("id, person_id")
              .eq("school_id", schoolId)
              .in("id", teacherIds)
              .order("id"),
          )
        : [],
    ]);
  const personIds = [...new Set(teacherRows.map((t) => t.person_id))];
  const people = personIds.length
    ? await rows(
        db
          .from("people")
          .select("id, full_name")
          .eq("school_id", schoolId)
          .in("id", personIds)
          .order("id"),
      )
    : [];
  const personNames = new Map(people.map((p) => [p.id, p.full_name]));
  const teachers = teacherRows.map((t) => ({
    id: t.id,
    name: personNames.get(t.person_id) ?? null,
  }));
  return buildAcademicAgenda(
    {
      terms,
      calendar,
      schedules,
      slots,
      subjects,
      assessments,
      tasks,
      assignments,
      groups,
      teachers,
    },
    data,
    { staff, teacherId, access },
  );
}

export const listAcademicAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => agendaRangeSchema.parse(input))
  .handler(({ data, context }) => loadAcademicAgendaForRequest(data, context));

export const saveAcademicAgendaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveAgendaEventSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Alterar a agenda");
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    const values = {
      school_id: membership.schoolId,
      academic_year_id: data.academicYearId,
      class_group_id: data.classGroupId,
      teacher_id: data.teacherId,
      title: data.title,
      description: data.description,
      category: data.category,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
      audience: data.audience,
      blocks_teaching: data.blocksTeaching,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("siga_calendar_events")
          .update({ ...values, version: data.expectedVersion! + 1 })
          .eq("school_id", membership.schoolId)
          .eq("id", data.id)
          .eq("version", data.expectedVersion!)
          .eq("status", "published")
          .select("id, version")
          .maybeSingle()
      : await db
          .from("siga_calendar_events")
          .insert({ ...values, created_by: context.userId })
          .select("id, version")
          .single();
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível guardar o evento académico.");
    if (!result.data)
      throw new Error("O evento foi alterado por outra pessoa; volte a carregar a agenda.");
    return result.data;
  });

export const cancelAcademicAgendaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancelAgendaEventSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Cancelar um evento");
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    const result = await db
      .from("siga_calendar_events")
      .update({
        status: "cancelled",
        version: data.expectedVersion + 1,
        updated_by: context.userId,
      })
      .eq("school_id", membership.schoolId)
      .eq("id", data.id)
      .eq("version", data.expectedVersion)
      .eq("status", "published")
      .select("id, version")
      .maybeSingle();
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível cancelar o evento.");
    if (!result.data)
      throw new Error("O evento foi alterado por outra pessoa; volte a carregar a agenda.");
    return result.data;
  });
