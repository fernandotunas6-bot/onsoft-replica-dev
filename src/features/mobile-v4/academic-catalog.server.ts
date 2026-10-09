import type { requireMobileAcademicAccess } from "./authorization";
import type { MobileAcademicScope } from "./academic-scope.server";
import type { AcademicCatalog } from "../../../mobile-v4/src/domain/catalog";
import { MobileApiError } from "./errors";

type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
type Query<T> = PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>;
async function read<T>(query: Query<T>): Promise<T[]> {
  const result = await query;
  if (result.error || !result.data || result.count == null || result.count !== result.data.length) {
    throw new MobileApiError(503, "ACADEMIC_CATALOG_UNAVAILABLE");
  }
  return result.data;
}
function required<T>(map: Map<string, T>, id: string): T {
  const result = map.get(id);
  if (!result) throw new MobileApiError(503, "ACADEMIC_CATALOG_INCONSISTENT");
  return result;
}
const unique = (values: (string | null)[]) => [
  ...new Set(values.filter((id): id is string => !!id)),
];

type Group = { id: string; name: string; academic_year_id: string };
type ClassSubject = {
  id: string;
  class_group_id: string;
  subject_id: string;
  teacher_id: string | null;
};
type Enrollment = { id: string; class_group_id: string; student_id: string };
type Student = { id: string; person_id: string };
type Teacher = { id: string; person_id: string; user_id: string | null };
type Person = { id: string; full_name: string; user_id: string | null };
type Schedule = {
  id: string;
  class_group_id: string;
  academic_year_id: string;
  valid_from: string | null;
  valid_to: string | null;
};
type Slot = {
  id: string;
  class_subject_id: string;
  schedule_id: string | null;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room: string | null;
  room_id: string | null;
};
type Task = {
  id: string;
  class_subject_id: string;
  timetable_slot_id: string | null;
  kind: string;
  title: string;
  description: string | null;
  due_on: string | null;
};

/** Server-only projection, after exact membership authorization and academic
 * scope resolution. All reads repeat tenant and active/publication filters.
 * No fallback names, inferred user IDs, synthetic lessons, grades or submissions.
 */
export async function readMobileAcademicCatalog(
  db: Db,
  scope: MobileAcademicScope,
  userId: string,
): Promise<AcademicCatalog> {
  const schoolId = scope.schoolId;
  const catalog: AcademicCatalog = {
    schoolId,
    role: scope.role,
    classes: [],
    timetable: [],
    tasks: [],
  };
  if (!scope.classSubjectIds.length) return catalog;
  let csQuery = db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id", { count: "exact" })
    .eq("school_id", schoolId)
    .eq("status", "active")
    .in("id", scope.classSubjectIds)
    .in("class_group_id", scope.classGroupIds);
  if (scope.role === "professor") csQuery = csQuery.eq("teacher_id", scope.teacherId!);
  const classSubjects = await read<ClassSubject>(csQuery.limit(1000));
  // Assignment/membership changes are not silently represented as an empty
  // roster; the caller must resolve a fresh scope on the next request.
  if (classSubjects.length !== scope.classSubjectIds.length) {
    throw new MobileApiError(409, "ACADEMIC_SCOPE_CHANGED");
  }
  const groupIds = unique(classSubjects.map((cs) => cs.class_group_id));
  const subjectIds = unique(classSubjects.map((cs) => cs.subject_id));
  const teacherIds = unique(classSubjects.map((cs) => cs.teacher_id));
  const [groups, subjects, teachers, enrollments, schedules, slots, tasks] = await Promise.all([
    read<Group>(
      db
        .from("class_groups")
        .select("id, name, academic_year_id", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("status", "active")
        .in("id", groupIds)
        .limit(1000),
    ),
    read<{ id: string; name: string }>(
      db
        .from("subjects")
        .select("id, name", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("id", subjectIds)
        .limit(1000),
    ),
    teacherIds.length
      ? read<Teacher>(
          db
            .from("teachers")
            .select("id, person_id, user_id", { count: "exact" })
            .eq("school_id", schoolId)
            .eq("status", "active")
            .in("id", teacherIds)
            .limit(1000),
        )
      : Promise.resolve([] as Teacher[]),
    scope.enrollmentIds.length
      ? read<Enrollment>(
          db
            .from("enrollments")
            .select("id, class_group_id, student_id", { count: "exact" })
            .eq("school_id", schoolId)
            .eq("status", "active")
            .in("id", scope.enrollmentIds)
            .in("class_group_id", groupIds)
            .limit(1000),
        )
      : Promise.resolve([] as Enrollment[]),
    read<Schedule>(
      db
        .from("academic_schedules")
        .select("id, class_group_id, academic_year_id, valid_from, valid_to", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("status", "published")
        .is("deleted_at", null)
        .in("class_group_id", groupIds)
        .limit(1000),
    ),
    read<Slot>(
      db
        .from("timetable_slots")
        .select("id, class_subject_id, schedule_id, weekday, starts_at, ends_at, room, room_id", {
          count: "exact",
        })
        .eq("school_id", schoolId)
        .eq("status", "active")
        .in("class_subject_id", scope.classSubjectIds)
        .limit(1000),
    ),
    read<Task>(
      db
        .from("siga_class_tasks")
        .select("id, class_subject_id, timetable_slot_id, kind, title, description, due_on", {
          count: "exact",
        })
        .eq("school_id", schoolId)
        .eq("status", "published")
        .in("class_subject_id", scope.classSubjectIds)
        .limit(1000),
    ),
  ]);
  if (enrollments.length !== scope.enrollmentIds.length)
    throw new MobileApiError(409, "ACADEMIC_SCOPE_CHANGED");
  if (scope.role === "aluno" && enrollments.some((row) => row.student_id !== scope.studentId)) {
    throw new MobileApiError(403, "ACADEMIC_SCOPE_FORBIDDEN");
  }
  const studentIds = unique(enrollments.map((row) => row.student_id));
  const students = studentIds.length
    ? await read<Student>(
        db
          .from("students")
          .select("id, person_id", { count: "exact" })
          .eq("school_id", schoolId)
          .is("deleted_at", null)
          .in("id", studentIds)
          .limit(1000),
      )
    : [];
  const personIds = unique([...students, ...teachers].map((row) => row.person_id));
  const people = personIds.length
    ? await read<Person>(
        db
          .from("people")
          .select("id, full_name, user_id", { count: "exact" })
          .eq("school_id", schoolId)
          .eq("status", "active")
          .is("deleted_at", null)
          .in("id", personIds)
          .limit(1000),
      )
    : [];
  const groupMap = new Map(groups.map((row) => [row.id, row]));
  const yearIds = unique(groups.map((group) => group.academic_year_id));
  const years = yearIds.length
    ? await read<{ id: string }>(
        db
          .from("academic_years")
          .select("id", { count: "exact" })
          .eq("school_id", schoolId)
          .eq("status", "active")
          .in("id", yearIds)
          .limit(1000),
      )
    : [];
  if (years.length !== yearIds.length) throw new MobileApiError(409, "ACADEMIC_SCOPE_CHANGED");
  const subjectMap = new Map(subjects.map((row) => [row.id, row]));
  const teacherMap = new Map(teachers.map((row) => [row.id, row]));
  const studentMap = new Map(students.map((row) => [row.id, row]));
  const personMap = new Map(people.map((row) => [row.id, row]));
  catalog.classes = classSubjects
    .map((cs) => {
      const group = required(groupMap, cs.class_group_id);
      const subject = required(subjectMap, cs.subject_id);
      const teacher = cs.teacher_id ? required(teacherMap, cs.teacher_id) : null;
      const teacherPerson = teacher ? required(personMap, teacher.person_id) : null;
      if (teacher?.user_id && teacherPerson?.user_id && teacher.user_id !== teacherPerson.user_id) {
        throw new MobileApiError(503, "ACADEMIC_CATALOG_INCONSISTENT");
      }
      if (scope.role === "professor" && (teacher?.user_id ?? teacherPerson?.user_id) !== userId) {
        throw new MobileApiError(409, "ACADEMIC_SCOPE_CHANGED");
      }
      return {
        classSubjectId: cs.id,
        classGroupId: group.id,
        academicYearId: group.academic_year_id,
        className: group.name,
        subjectId: cs.subject_id,
        subjectName: subject.name,
        teacher:
          teacher && teacherPerson
            ? {
                id: teacher.id,
                name: teacherPerson.full_name,
                userId: teacher.user_id ?? teacherPerson.user_id,
              }
            : null,
        students: enrollments
          .filter((row) => row.class_group_id === group.id)
          .map((enrollment) => {
            const student = required(studentMap, enrollment.student_id);
            const person = required(personMap, student.person_id);
            if (scope.role === "aluno" && person.user_id !== userId) {
              throw new MobileApiError(409, "ACADEMIC_SCOPE_CHANGED");
            }
            return {
              studentId: student.id,
              enrollmentId: enrollment.id,
              name: person.full_name,
              userId: person.user_id,
            };
          }),
      };
    })
    .sort(
      (a, b) =>
        a.className.localeCompare(b.className, "pt") ||
        a.subjectName.localeCompare(b.subjectName, "pt") ||
        a.classSubjectId.localeCompare(b.classSubjectId),
    );

  const csMap = new Map(classSubjects.map((row) => [row.id, row]));
  const scheduleMap = new Map(schedules.map((row) => [row.id, row]));
  const visibleSlots = slots.filter((slot) => {
    if (!slot.schedule_id) return true; // Existing unversioned active Sga timetable.
    const schedule = scheduleMap.get(slot.schedule_id);
    if (!schedule) return false; // Draft/review/archived or another school.
    const cs = required(csMap, slot.class_subject_id);
    const group = required(groupMap, cs.class_group_id);
    if (
      schedule.class_group_id !== group.id ||
      schedule.academic_year_id !== group.academic_year_id
    ) {
      throw new MobileApiError(503, "ACADEMIC_CATALOG_INCONSISTENT");
    }
    return true;
  });
  const roomIds = unique(visibleSlots.map((slot) => slot.room_id));
  const rooms = roomIds.length
    ? await read<{ id: string; name: string }>(
        db
          .from("rooms")
          .select("id, name", { count: "exact" })
          .eq("school_id", schoolId)
          .eq("status", "active")
          .is("deleted_at", null)
          .in("id", roomIds)
          .limit(1000),
      )
    : [];
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  catalog.timetable = visibleSlots
    .map((slot) => {
      const schedule = slot.schedule_id ? required(scheduleMap, slot.schedule_id) : null;
      if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7) {
        throw new MobileApiError(503, "ACADEMIC_CATALOG_INCONSISTENT");
      }
      return {
        slotId: slot.id,
        classSubjectId: slot.class_subject_id,
        scheduleId: slot.schedule_id,
        publication: schedule ? ("published" as const) : ("legacy" as const),
        validFrom: schedule?.valid_from ?? null,
        validTo: schedule?.valid_to ?? null,
        weekday: slot.weekday,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        room: slot.room_id ? required(roomMap, slot.room_id).name : slot.room,
      };
    })
    .sort(
      (a, b) =>
        a.weekday - b.weekday ||
        a.startsAt.localeCompare(b.startsAt) ||
        a.slotId.localeCompare(b.slotId),
    );
  const allSlotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const visibleSlotIds = new Set(visibleSlots.map((slot) => slot.id));
  catalog.tasks = tasks
    .filter((task) => {
      if (!task.timetable_slot_id) return true;
      const slot = required(allSlotMap, task.timetable_slot_id);
      if (slot.class_subject_id !== task.class_subject_id)
        throw new MobileApiError(503, "ACADEMIC_CATALOG_INCONSISTENT");
      return visibleSlotIds.has(slot.id);
    })
    .map((task) => ({
      id: task.id,
      classSubjectId: task.class_subject_id,
      slotId: task.timetable_slot_id,
      kind: task.kind,
      title: task.title,
      instructions: task.description,
      due: task.due_on,
    }))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.id.localeCompare(b.id));
  return catalog;
}
