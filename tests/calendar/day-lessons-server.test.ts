import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  membership: { appRole: "Professor", allAppRoles: ["Professor"] } as {
    appRole: string;
    allAppRoles: string[];
  } | null,
  agenda: vi.fn(),
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => mock.membership,
}));
vi.mock("@/features/calendar/agenda-server", () => ({ loadAcademicAgendaForRequest: mock.agenda }));
import { loadDayAgendaLessons } from "@/features/calendar/day-lessons-server";
const context = { userId: "teacher-user", supabase: {} as never };
beforeEach(() => {
  vi.clearAllMocks();
  mock.membership = { appRole: "Professor", allAppRoles: ["Professor"] };
});
describe("existing daily lesson API", () => {
  it("keeps the slot ID, names and local times from authorized published occurrences", async () => {
    mock.agenda.mockResolvedValue([
      {
        start: "2026-10-26T08:00:00+01:00",
        end: "2026-10-26T08:45:00+01:00",
        extendedProps: {
          source: "lesson",
          sourceId: "slot@2026-10-26",
          classGroupId: "group",
          classGroupName: "7.ª A",
          subjectId: "subject",
          subjectName: "Matemática",
          teacherId: "teacher",
          teacherName: "Docente",
          room: "Sala 1",
        },
      },
    ]);
    expect(await loadDayAgendaLessons({ date: "2026-10-26", limit: 1 }, context)).toEqual([
      {
        id: "slot",
        startsAt: "08:00",
        endsAt: "08:45",
        classGroupId: "group",
        classGroupName: "7.ª A",
        subjectId: "subject",
        subjectName: "Matemática",
        teacherId: "teacher",
        teacherName: "Docente",
        room: "Sala 1",
      },
    ]);
    expect(mock.agenda).toHaveBeenCalledWith({ start: "2026-10-26", end: "2026-10-27" }, context);
  });
  it("does not turn holidays and meetings into attendance lessons", async () => {
    mock.agenda.mockResolvedValue([
      { extendedProps: { source: "holiday" } },
      { extendedProps: { source: "calendar" } },
    ]);
    expect(await loadDayAgendaLessons({ date: "2026-11-02" }, context)).toEqual([]);
  });
  it("preserves the existing empty staff agenda for a student or missing membership", async () => {
    mock.membership = { appRole: "Aluno", allAppRoles: ["Aluno"] };
    expect(await loadDayAgendaLessons({ date: "2026-10-26" }, context)).toEqual([]);
    mock.membership = null;
    expect(await loadDayAgendaLessons({ date: "2026-10-26" }, context)).toEqual([]);
    expect(mock.agenda).not.toHaveBeenCalled();
  });
  it("propagates a denied module grant instead of leaking a broader fallback", async () => {
    mock.agenda.mockRejectedValue(new Error("Sem acesso ao módulo"));
    await expect(loadDayAgendaLessons({ date: "2026-10-26" }, context)).rejects.toThrow(/módulo/);
  });
  it("rejects nonexistent dates before consulting the agenda", async () => {
    await expect(loadDayAgendaLessons({ date: "2026-02-30" }, context)).rejects.toThrow();
    expect(mock.agenda).not.toHaveBeenCalled();
  });
});
