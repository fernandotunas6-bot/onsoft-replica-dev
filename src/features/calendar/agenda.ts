import { addDaysIso } from "./dates";
import { angolaHolidaysBetween } from "./angola-holidays";
import type { AgendaRange } from "./agenda-schemas";

export type AgendaEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  editable: false;
  extendedProps: {
    source: "term" | "lesson" | "assessment" | "task" | "calendar" | "holiday";
    sourceId: string;
    category: string;
    academicYearId?: string;
    classGroupId?: string | null;
    subjectId?: string | null;
    teacherId?: string | null;
    room?: string | null;
    version?: number;
    description?: string;
    classGroupName?: string;
    subjectName?: string;
    teacherName?: string | null;
  };
};
export type AgendaTerm = {
  id: string;
  academic_year_id: string;
  name: string;
  sequence: number;
  starts_on: string;
  ends_on: string;
};
export type AgendaSchedule = {
  id: string;
  academic_year_id: string;
  class_group_id: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  term: number | null;
};
export type AgendaSlot = {
  id: string;
  class_subject_id: string;
  schedule_id: string | null;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room: string | null;
};
export type AgendaAssignment = {
  id: string;
  class_group_id: string;
  subject_id: string;
  teacher_id: string | null;
};
export type AgendaCalendarRow = {
  id: string;
  academic_year_id: string;
  class_group_id: string | null;
  teacher_id: string | null;
  title: string;
  description?: string;
  category: string;
  starts_on: string;
  ends_on: string;
  starts_at: string | null;
  ends_at: string | null;
  audience: string;
  blocks_teaching: boolean;
  version: number;
};
export type AgendaAccess = {
  classGroupId: string;
  subjectId?: string;
  startsOn: string;
  endsOn: string;
};
export type AgendaData = {
  terms: AgendaTerm[];
  schedules: AgendaSchedule[];
  slots: AgendaSlot[];
  assignments: AgendaAssignment[];
  groups: Array<{ id: string; name: string; academic_year_id: string }>;
  subjects: Array<{ id: string; name: string }>;
  teachers?: Array<{ id: string; name: string | null }>;
  calendar: AgendaCalendarRow[];
  assessments: Array<{
    id: string;
    class_group_id: string | null;
    subject_id: string | null;
    name: string;
    assessed_on: string | null;
    starts_at: string | null;
    duration_minutes: number | null;
    purpose: string | null;
  }>;
  tasks: Array<{
    id: string;
    class_subject_id: string;
    title: string;
    due_on: string | null;
    kind: string;
  }>;
};

/** Published read model; no attendance writes or calendar copies of timetable rows. */
export function buildAcademicAgenda(
  data: AgendaData,
  range: AgendaRange,
  scope: {
    staff: boolean;
    teacherId?: string;
    access?: AgendaAccess[];
  },
): AgendaEvent[] {
  const events: AgendaEvent[] = [];
  const assignments = new Map(data.assignments.map((a) => [a.id, a]));
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  const subjects = new Map(data.subjects.map((s) => [s.id, s.name]));
  const teachers = new Map((data.teachers ?? []).map((t) => [t.id, t.name]));
  const schedules = new Map(
    data.schedules.filter((s) => s.status === "published").map((s) => [s.id, s]),
  );
  const permitted = (group: string, subject: string | null, day: string) =>
    (!range.classGroupId || range.classGroupId === group) &&
    (!scope.access ||
      scope.access.some(
        (a) =>
          a.classGroupId === group &&
          (!a.subjectId || a.subjectId === subject) &&
          a.startsOn <= day &&
          a.endsOn >= day,
      ));
  const teacher = scope.teacherId ?? range.teacherId;
  const pairPermitted = (group: string, subject: string | null, day: string) =>
    permitted(group, subject, day) &&
    (!teacher ||
      data.assignments.some(
        (a) =>
          a.class_group_id === group &&
          (!subject || a.subject_id === subject) &&
          a.teacher_id === teacher,
      ));
  const add = (
    source: AgendaEvent["extendedProps"]["source"],
    id: string,
    title: string,
    start: string,
    end: string | undefined,
    extra: Omit<AgendaEvent["extendedProps"], "source" | "sourceId">,
    allDay = true,
  ) => {
    if (
      start.slice(0, 10) >= range.end ||
      (end
        ? allDay
          ? end <= range.start
          : Date.parse(end) <= Date.parse(`${range.start}T00:00:00+01:00`)
        : start.slice(0, 10) < range.start)
    )
      return;
    events.push({
      id: `${source}:${id}`,
      title,
      start,
      ...(end ? { end } : {}),
      allDay,
      editable: false,
      extendedProps: { source, sourceId: id, ...extra },
    });
    if (events.length > 50_000)
      throw new Error("Agenda demasiado extensa; seleccione uma turma ou um intervalo menor.");
  };
  const holidays = angolaHolidaysBetween(range.start, addDaysIso(range.end, -1));
  const blocked = new Set(holidays.map((h) => h.date));
  for (const h of holidays)
    add("holiday", h.date, h.name, h.date, addDaysIso(h.date, 1), { category: "holiday" });
  for (const term of data.terms)
    add("term", term.id, term.name, term.starts_on, addDaysIso(term.ends_on, 1), {
      category: "academic",
      academicYearId: term.academic_year_id,
    });
  for (const e of data.calendar) {
    if (!scope.staff && e.audience === "staff") continue;
    if (e.teacher_id && (!scope.staff || (teacher && e.teacher_id !== teacher))) continue;
    if (range.classGroupId && e.class_group_id && e.class_group_id !== range.classGroupId) continue;
    if (
      teacher &&
      e.class_group_id &&
      !data.assignments.some(
        (a) => a.class_group_id === e.class_group_id && a.teacher_id === teacher,
      )
    )
      continue;
    if (
      scope.access &&
      e.class_group_id &&
      !scope.access.some(
        (a) =>
          a.classGroupId === e.class_group_id && a.startsOn <= e.ends_on && a.endsOn >= e.starts_on,
      )
    )
      continue;
    add(
      "calendar",
      e.id,
      e.title,
      e.starts_at ? `${e.starts_on}T${e.starts_at}+01:00` : e.starts_on,
      e.ends_at ? `${e.ends_on}T${e.ends_at}+01:00` : addDaysIso(e.ends_on, 1),
      {
        category: e.category,
        academicYearId: e.academic_year_id,
        classGroupId: e.class_group_id,
        teacherId: e.teacher_id,
        version: e.version,
        description: e.description ?? "",
      },
      !e.starts_at,
    );
  }
  for (let day = range.start; day < range.end; day = addDaysIso(day, 1)) {
    if (blocked.has(day)) continue;
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
    for (const slot of data.slots) {
      if (slot.weekday !== weekday || !slot.schedule_id) continue;
      const a = assignments.get(slot.class_subject_id),
        s = schedules.get(slot.schedule_id);
      if (
        !a ||
        !s ||
        s.class_group_id !== a.class_group_id ||
        (teacher && a.teacher_id !== teacher) ||
        !permitted(a.class_group_id, a.subject_id, day)
      )
        continue;
      const group = groups.get(a.class_group_id);
      if (
        !group ||
        !s.valid_from ||
        group.academic_year_id !== s.academic_year_id ||
        day < s.valid_from ||
        (s.valid_to && day > s.valid_to)
      )
        continue;
      if (
        !data.terms.some(
          (t) =>
            t.academic_year_id === s.academic_year_id &&
            (!s.term || t.sequence === s.term) &&
            t.starts_on <= day &&
            t.ends_on >= day,
        )
      )
        continue;
      if (
        data.calendar.some(
          (e) =>
            e.blocks_teaching &&
            e.academic_year_id === s.academic_year_id &&
            (!e.class_group_id || e.class_group_id === a.class_group_id) &&
            (!e.teacher_id || e.teacher_id === a.teacher_id) &&
            e.starts_on <= day &&
            e.ends_on >= day,
        )
      )
        continue;
      add(
        "lesson",
        `${slot.id}@${day}`,
        `${subjects.get(a.subject_id) ?? "Disciplina"} · ${group.name}`,
        `${day}T${slot.starts_at}+01:00`,
        `${day}T${slot.ends_at}+01:00`,
        {
          category: "lesson",
          academicYearId: s.academic_year_id,
          classGroupId: a.class_group_id,
          subjectId: a.subject_id,
          teacherId: a.teacher_id,
          room: slot.room,
          classGroupName: group.name,
          subjectName: subjects.get(a.subject_id) ?? "Disciplina",
          teacherName: a.teacher_id ? (teachers.get(a.teacher_id) ?? null) : null,
        },
        false,
      );
    }
  }
  for (const a of data.assessments) {
    if (
      !a.class_group_id ||
      !a.subject_id ||
      !a.assessed_on ||
      !pairPermitted(a.class_group_id, a.subject_id, a.assessed_on)
    )
      continue;
    const start = a.starts_at ? `${a.assessed_on}T${a.starts_at}+01:00` : a.assessed_on;
    const end = a.starts_at
      ? a.duration_minutes
        ? new Date(Date.parse(start) + a.duration_minutes * 60_000).toISOString()
        : undefined
      : addDaysIso(a.assessed_on, 1);
    add(
      "assessment",
      a.id,
      a.name,
      start,
      end,
      {
        category: a.purpose ?? "assessment",
        academicYearId: groups.get(a.class_group_id)?.academic_year_id,
        classGroupId: a.class_group_id,
        subjectId: a.subject_id,
      },
      !a.starts_at,
    );
  }
  for (const task of data.tasks) {
    const a = assignments.get(task.class_subject_id);
    if (!a || !task.due_on || !pairPermitted(a.class_group_id, a.subject_id, task.due_on)) continue;
    add("task", task.id, task.title, task.due_on, addDaysIso(task.due_on, 1), {
      category: "deadline",
      classGroupId: a.class_group_id,
      subjectId: a.subject_id,
    });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
