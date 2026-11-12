import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  agenda: vi.fn(),
  upsert: vi.fn(),
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
const query = { upsert: mock.upsert };
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
  mock.upsert.mockReset();
  mock.upsert.mockResolvedValue({ error: null, count: 1 });
});
describe("attendance sessions from the published agenda", () => {
  it("materializes exactly the official occurrences with their Luanda times", async () => {
    expect(await syncAcademicAgendaToSessions(input)).toBe(1);
    expect(mock.agenda).toHaveBeenCalledWith(
      { start: "2026-10-25", end: "2026-11-22", classGroupId: "group", academicYearId: "year" },
      input.context,
    );
    expect(mock.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          school_id: "school",
          timetable_slot_id: "slot",
          lesson_date: "2026-10-26",
          starts_at: "08:00",
          ends_at: "08:45",
          status: "pending",
        }),
      ],
      {
        onConflict: "school_id,timetable_slot_id,lesson_date",
        ignoreDuplicates: true,
        count: "exact",
      },
    );
  });
  it("does not duplicate a previously materialized lesson", async () => {
    mock.upsert.mockResolvedValue({ error: null, count: 0 });
    expect(await syncAcademicAgendaToSessions(input)).toBe(0);
    expect(mock.upsert).toHaveBeenCalledOnce();
  });
  it("does not create attendance for meetings or holidays", async () => {
    mock.agenda.mockResolvedValue([{ ...events[0], extendedProps: { source: "holiday" } }]);
    expect(await syncAcademicAgendaToSessions(input)).toBe(0);
    expect(mock.upsert).not.toHaveBeenCalled();
  });
  it("reports a failed write without claiming successful synchronization", async () => {
    mock.upsert.mockResolvedValue({ error: { message: "connection refused" }, count: null });
    await expect(syncAcademicAgendaToSessions(input)).rejects.toThrow();
    expect(mock.upsert).toHaveBeenCalledOnce();
  });
  it("uses conflict-ignore so simultaneous resyncs create only one session", async () => {
    const ledger = new Set<string>();
    mock.upsert.mockImplementation(
      async (
        candidates: Array<{ timetable_slot_id: string; lesson_date: string }>,
        options: { ignoreDuplicates: boolean },
      ) => {
        expect(options.ignoreDuplicates).toBe(true);
        let count = 0;
        for (const row of candidates) {
          const key = `${row.timetable_slot_id}@${row.lesson_date}`;
          if (!ledger.has(key)) {
            ledger.add(key);
            count += 1;
          }
        }
        return { error: null, count };
      },
    );
    expect(
      await Promise.all([syncAcademicAgendaToSessions(input), syncAcademicAgendaToSessions(input)]),
    ).toEqual([1, 0]);
    expect(ledger.size).toBe(1);
  });
  it("batches a large agenda and counts only newly inserted rows", async () => {
    mock.agenda.mockResolvedValue(
      Array.from({ length: 1001 }, (_, i) => ({
        ...events[0],
        extendedProps: { ...events[0].extendedProps, sourceId: `slot-${i}@2026-10-26` },
      })),
    );
    mock.upsert
      .mockResolvedValueOnce({ error: null, count: 500 })
      .mockResolvedValueOnce({ error: null, count: 400 })
      .mockResolvedValueOnce({ error: null, count: 1 });
    expect(await syncAcademicAgendaToSessions(input)).toBe(901);
    expect(mock.upsert.mock.calls.map(([rows]) => rows.length)).toEqual([500, 500, 1]);
  });
  it("does not invent a count if the database omits confirmation", async () => {
    mock.upsert.mockResolvedValue({ error: null, count: null });
    await expect(syncAcademicAgendaToSessions(input)).rejects.toThrow(/confirmar/);
  });
  it("can resume after a later batch fails without recreating the committed batch", async () => {
    mock.agenda.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({
        ...events[0],
        extendedProps: { ...events[0].extendedProps, sourceId: `slot-${i}@2026-10-26` },
      })),
    );
    mock.upsert
      .mockResolvedValueOnce({ error: null, count: 500 })
      .mockResolvedValueOnce({ error: { message: "connection refused" }, count: null });
    await expect(syncAcademicAgendaToSessions(input)).rejects.toThrow();
    mock.upsert
      .mockResolvedValueOnce({ error: null, count: 0 })
      .mockResolvedValueOnce({ error: null, count: 1 });
    expect(await syncAcademicAgendaToSessions(input)).toBe(1);
    expect(mock.upsert).toHaveBeenCalledTimes(4);
  });
});
