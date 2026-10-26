import { describe, expect, it, vi } from "vitest";
import { buildAcademicAgenda, type AgendaData } from "@/features/calendar/agenda";
import { agendaRangeSchema, saveAgendaEventSchema } from "@/features/calendar/agenda-schemas";
import { fullCalendarAcademicSource } from "@/features/calendar/fullcalendar-source";

const range = { start: "2026-10-25", end: "2026-11-03" };
function fixture(): AgendaData {
  return {
    terms: [
      {
        id: "term",
        academic_year_id: "year",
        sequence: 1,
        name: "Semestre 1",
        starts_on: "2026-09-01",
        ends_on: "2026-12-15",
      },
    ],
    groups: [{ id: "group", name: "A", academic_year_id: "year" }],
    subjects: [{ id: "subject", name: "Matemática" }],
    assignments: [
      { id: "cs", class_group_id: "group", subject_id: "subject", teacher_id: "teacher" },
    ],
    schedules: [
      {
        id: "schedule",
        academic_year_id: "year",
        class_group_id: "group",
        status: "published",
        valid_from: "2026-10-01",
        valid_to: "2026-12-15",
        term: null,
      },
    ],
    slots: [
      {
        id: "slot",
        class_subject_id: "cs",
        schedule_id: "schedule",
        weekday: 1,
        starts_at: "08:00:00",
        ends_at: "08:45:00",
        room: "Sala 1",
      },
    ],
    calendar: [],
    assessments: [],
    tasks: [],
  };
}
const lessons = (data: AgendaData, scope = { staff: true }) =>
  buildAcademicAgenda(data, range, scope).filter((e) => e.extendedProps.source === "lesson");

describe("published academic agenda", () => {
  it("expands the published week inside terms, excluding national holidays", () => {
    const result = lessons(fixture());
    expect(result.map((e) => e.start)).toEqual(["2026-10-26T08:00:00+01:00"]);
    expect(result[0].id).toBe("lesson:slot@2026-10-26");
    expect(result[0].editable).toBe(false);
  });
  it.each(["draft", "review", "approved", "archived"])("does not expose %s schedules", (status) => {
    const data = fixture();
    data.schedules[0].status = status;
    expect(lessons(data)).toEqual([]);
  });
  it("does not publish legacy slots without a version", () => {
    const data = fixture();
    data.slots[0].schedule_id = null;
    expect(lessons(data)).toEqual([]);
  });
  it("respects validity and gaps in teaching periods", () => {
    const data = fixture();
    data.schedules[0].valid_from = "2026-10-27";
    expect(lessons(data)).toEqual([]);
    data.schedules[0].valid_from = "2026-10-01";
    data.terms[0].ends_on = "2026-10-25";
    expect(lessons(data)).toEqual([]);
  });
  it("maps Sunday to database weekday 7", () => {
    const data = fixture();
    data.slots[0].weekday = 7;
    expect(lessons(data).map((e) => e.start.slice(0, 10))).toEqual(["2026-10-25", "2026-11-01"]);
  });
  it("keeps all-day ends exclusive and timed assessment duration exact", () => {
    const data = fixture();
    data.assessments.push({
      id: "exam",
      class_group_id: "group",
      subject_id: "subject",
      name: "Prova",
      assessed_on: "2026-10-26",
      starts_at: "08:00:00",
      duration_minutes: 90,
      purpose: "assessment",
    });
    const events = buildAcademicAgenda(data, range, { staff: true });
    expect(events.find((e) => e.id === "term:term")?.end).toBe("2026-12-16");
    expect(events.find((e) => e.id === "assessment:exam")).toMatchObject({
      start: "2026-10-26T08:00:00+01:00",
      end: "2026-10-26T08:30:00.000Z",
      allDay: false,
    });
  });
  it("limits teachers to their own assignments and assessments", () => {
    const data = fixture();
    data.assessments.push({
      id: "exam",
      class_group_id: "group",
      subject_id: "other",
      name: "Prova alheia",
      assessed_on: "2026-10-26",
      starts_at: null,
      duration_minutes: null,
      purpose: "assessment",
    });
    const events = buildAcademicAgenda(data, range, { staff: true, teacherId: "other" });
    expect(events.filter((e) => ["lesson", "assessment"].includes(e.extendedProps.source))).toEqual(
      [],
    );
  });
  it("limits student lessons to enrollment dates and course-unit subjects", () => {
    const data = fixture();
    expect(
      buildAcademicAgenda(data, range, {
        staff: false,
        access: [
          { classGroupId: "group", subjectId: "other", startsOn: range.start, endsOn: range.end },
        ],
      }).filter((e) => e.extendedProps.source === "lesson"),
    ).toEqual([]);
    expect(
      buildAcademicAgenda(data, range, {
        staff: false,
        access: [{ classGroupId: "group", startsOn: "2026-10-27", endsOn: range.end }],
      }).filter((e) => e.extendedProps.source === "lesson"),
    ).toEqual([]);
  });
  it("blocks lessons with staff-only closures without leaking their titles", () => {
    const data = fixture();
    data.calendar.push({
      id: "closure",
      academic_year_id: "year",
      class_group_id: null,
      teacher_id: null,
      title: "Reunião reservada",
      category: "closure",
      starts_on: "2026-10-26",
      ends_on: "2026-10-26",
      starts_at: null,
      ends_at: null,
      audience: "staff",
      blocks_teaching: true,
      version: 1,
    });
    const events = buildAcademicAgenda(data, range, {
      staff: false,
      access: [{ classGroupId: "group", startsOn: range.start, endsOn: range.end }],
    });
    expect(
      events.some((e) => e.extendedProps.source === "lesson" || e.title.includes("reservada")),
    ).toBe(false);
  });
  it("includes class deadlines and excludes another class event", () => {
    const data = fixture();
    data.tasks.push({
      id: "task",
      class_subject_id: "cs",
      title: "Entrega",
      due_on: "2026-10-28",
      kind: "homework",
    });
    data.calendar.push({
      id: "event",
      academic_year_id: "year",
      class_group_id: "other",
      teacher_id: null,
      title: "Outra turma",
      category: "meeting",
      starts_on: "2026-10-28",
      ends_on: "2026-10-28",
      starts_at: null,
      ends_at: null,
      audience: "all",
      blocks_teaching: false,
      version: 1,
    });
    const events = buildAcademicAgenda(data, range, {
      staff: false,
      access: [{ classGroupId: "group", startsOn: range.start, endsOn: range.end }],
    });
    expect(events.find((e) => e.id === "task:task")).toMatchObject({
      start: "2026-10-28",
      end: "2026-10-29",
    });
    expect(events.find((e) => e.id === "calendar:event")).toBeUndefined();
  });
  it("rejects nonexistent dates and oversized/empty windows", () => {
    for (const input of [
      { start: "2026-02-30", end: "2026-03-02" },
      { start: range.start, end: range.start },
      { start: "2026-01-01", end: "2027-01-01" },
    ])
      expect(agendaRangeSchema.safeParse(input).success).toBe(false);
  });
  it("rejects timed closures and updates without an expected version", () => {
    const valid = {
      academicYearId: "11111111-1111-4111-8111-111111111111",
      title: "Evento",
      category: "closure",
      startsOn: "2026-10-26",
      endsOn: "2026-10-26",
    };
    expect(saveAgendaEventSchema.safeParse(valid).success).toBe(true);
    expect(
      saveAgendaEventSchema.safeParse({
        ...valid,
        startsAt: "08:00",
        endsAt: "09:00",
        blocksTeaching: true,
      }).success,
    ).toBe(false);
    expect(saveAgendaEventSchema.safeParse({ ...valid, id: valid.academicYearId }).success).toBe(
      false,
    );
  });
  it("connects FullCalendar's function source to an authenticated loader", async () => {
    const load = vi.fn(async () => []);
    const source = fullCalendarAcademicSource(load);
    await source({
      startStr: "2026-10-25T00:00:00+01:00",
      endStr: "2026-11-03T00:00:00+01:00",
      timeZone: "Africa/Luanda",
    });
    expect(load).toHaveBeenCalledWith(range);
    await expect(
      source({ startStr: range.start, endStr: range.end, timeZone: "local" }),
    ).rejects.toThrow(/Africa\/Luanda/);
  });
});
