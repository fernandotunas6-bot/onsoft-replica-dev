import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  agenda: vi.fn(),
  read: {
    data: [] as Array<{ timetable_slot_id: string; lesson_date: string }>,
    error: null as null | { message: string },
  },
  insert: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/features/calendar/agenda-server", () => ({ loadAcademicAgendaForRequest: mock.agenda }));
vi.mock("@/lib/school-date", () => ({
  schoolTodayIso: () => "2026-10-25",
  schoolDateInDays: () => "2026-11-22",
}));
import { syncAcademicAgendaToSessions } from "@/features/calendar/agenda-sessions";
const events = [
  {
    start: "2026-10-26T08:00:00+01:00",
    end: "2026-10-26T08:45:00+01:00",
    extendedProps: {
      source: "lesson",
      sourceId: "slot@2026-10-26",
      subjectId: "subject",
      teacherId: "teacher",
    },
  },
];
const query = {
  select: () => query,
  eq: () => query,
  in: () => query,
  gte: () => query,
  lt: async () => mock.read,
  insert: mock.insert,
};
const input = {
  db: { from: () => query } as never,
  schoolId: "school",
  classGroupId: "group",
  academicYearId: "year",
  userId: "user",
  context: { userId: "user", supabase: {} as never },
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.agenda.mockResolvedValue(events);
  mock.read = { data: [], error: null };
});
describe("attendance sessions from the published agenda", () => {
  it("materializes exactly the official occurrences with their Luanda times", async () => {
    expect(await syncAcademicAgendaToSessions(input)).toBe(1);
    expect(mock.agenda).toHaveBeenCalledWith(
      { start: "2026-10-25", end: "2026-11-22", classGroupId: "group", academicYearId: "year" },
      input.context,
    );
    expect(mock.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        school_id: "school",
        timetable_slot_id: "slot",
        lesson_date: "2026-10-26",
        starts_at: "08:00",
        ends_at: "08:45",
        status: "pending",
      }),
    ]);
  });
  it("does not duplicate a previously materialized lesson", async () => {
    mock.read.data = [{ timetable_slot_id: "slot", lesson_date: "2026-10-26" }];
    expect(await syncAcademicAgendaToSessions(input)).toBe(0);
    expect(mock.insert).not.toHaveBeenCalled();
  });
  it("does not create attendance for meetings or holidays", async () => {
    mock.agenda.mockResolvedValue([{ ...events[0], extendedProps: { source: "holiday" } }]);
    expect(await syncAcademicAgendaToSessions(input)).toBe(0);
    expect(mock.insert).not.toHaveBeenCalled();
  });
  it("stops when existing sessions cannot be read", async () => {
    mock.read.error = { message: "connection refused" };
    await expect(syncAcademicAgendaToSessions(input)).rejects.toThrow();
    expect(mock.insert).not.toHaveBeenCalled();
  });
});
