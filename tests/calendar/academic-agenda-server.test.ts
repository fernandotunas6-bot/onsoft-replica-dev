import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  membership: { schoolId: "school-a", appRole: "Administrador", allAppRoles: ["Administrador"] },
  ownTeacher: "teacher-a" as string | null,
  visible: null as null | { schoolId: string; studentId: string },
  db: { from: vi.fn() },
  moduleGuard: vi.fn(),
  writeGuard: vi.fn(),
  records: {} as Record<string, unknown[]>,
  error: null as { message: string } | null,
  saved: { id: "event", version: 2 } as { id: string; version: number } | null,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => state.db,
  resolveSgaMembershipAdmin: async () => state.membership,
  requireSgaWriterFor: state.moduleGuard,
  requireSgaWriterForWrite: state.writeGuard,
}));
vi.mock("@/features/academic/own-teacher", () => ({ ownTeacherId: async () => state.ownTeacher }));
vi.mock("@/features/dashboard/student-access", () => ({
  resolveVisibleStudent: async () => state.visible,
}));
import {
  loadAcademicAgendaForRequest,
  saveAcademicAgendaEvent,
  cancelAcademicAgendaEvent,
} from "@/features/calendar/agenda-server";

const filters: Array<[string, string, unknown]> = [];
const range = { start: "2026-10-25", end: "2026-11-03" };
const context = { userId: "user-a", supabase: {} as never, claims: { aal: "aal2" } };
type Handler = (args: {
  data: Record<string, unknown>;
  context: typeof context;
}) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  filters.length = 0;
  state.membership = {
    schoolId: "school-a",
    appRole: "Administrador",
    allAppRoles: ["Administrador"],
  };
  state.ownTeacher = "teacher-a";
  state.visible = null;
  state.error = null;
  state.saved = { id: "event", version: 2 };
  state.writeGuard.mockResolvedValue(state.membership);
  state.records = {
    academic_years: [{ id: "year" }],
    class_groups: [{ id: "group", name: "A", academic_year_id: "year" }],
    class_subjects: [
      { id: "cs", class_group_id: "group", subject_id: "subject", teacher_id: "teacher-a" },
    ],
  };
  state.db.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      order: () => query,
      insert: () => query,
      update: () => query,
      eq: (key: string, value: unknown) => {
        filters.push([table, key, value]);
        return query;
      },
      in: (key: string, value: unknown) => {
        filters.push([table, key, value]);
        return query;
      },
      is: () => query,
      lt: () => query,
      gte: () => query,
      range: async (from: number, to: number) => ({
        data: (state.records[table] ?? []).slice(from, to + 1),
        error: state.error,
      }),
      maybeSingle: async () => ({ data: state.saved, error: state.error }),
      single: async () => ({ data: state.saved, error: state.error }),
    };
    return query;
  });
});

describe("academic agenda authorization", () => {
  it("scopes every query to the authenticated school and checks module grants", async () => {
    await loadAcademicAgendaForRequest(range, context);
    expect(state.moduleGuard).toHaveBeenCalled();
    for (const [table] of state.db.from.mock.calls)
      expect(filters).toContainEqual([table, "school_id", "school-a"]);
  });
  it("refuses a teacher selecting another teacher", async () => {
    state.membership.appRole = "Professor";
    state.membership.allAppRoles = ["Professor"];
    await expect(
      loadAcademicAgendaForRequest(
        { ...range, teacherId: "11111111-1111-4111-8111-111111111111" },
        context,
      ),
    ).rejects.toThrow(/docente/);
    expect(state.db.from).not.toHaveBeenCalled();
  });
  it("restricts a teacher's assignments even without a requested teacher filter", async () => {
    state.membership.appRole = "Professor";
    state.membership.allAppRoles = ["Professor"];
    await loadAcademicAgendaForRequest(range, context);
    expect(filters).toContainEqual(["class_subjects", "teacher_id", "teacher-a"]);
  });
  it("refuses an unlinked child and a visible student from another school", async () => {
    state.membership.appRole = "Encarregado";
    state.membership.allAppRoles = ["Encarregado"];
    await expect(loadAcademicAgendaForRequest(range, context)).rejects.toThrow(/estudante/);
    state.visible = { schoolId: "school-b", studentId: "student" };
    await expect(loadAcademicAgendaForRequest(range, context)).rejects.toThrow(/estudante/);
  });
  it("requires an enrollment before returning a student's agenda", async () => {
    state.membership.appRole = "Aluno";
    state.membership.allAppRoles = ["Aluno"];
    state.visible = { schoolId: "school-a", studentId: "student" };
    expect(await loadAcademicAgendaForRequest(range, context)).toEqual([]);
    expect(filters).toContainEqual(["enrollments", "student_id", "student"]);
    expect(filters).toContainEqual(["course_unit_enrollments", "student_id", "student"]);
  });
  it("pages sources beyond the first database page", async () => {
    state.records.terms = Array.from({ length: 501 }, (_, i) => ({
      id: `term-${i}`,
      academic_year_id: "year",
      sequence: i + 1,
      name: `Período ${i}`,
      starts_on: range.start,
      ends_on: range.start,
    }));
    const events = await loadAcademicAgendaForRequest(range, context);
    expect(events.filter((e) => e.extendedProps.source === "term")).toHaveLength(501);
  });
  it("does not treat an ended enrollment without an end date as indefinite access", async () => {
    state.membership.appRole = "Aluno";
    state.membership.allAppRoles = ["Aluno"];
    state.visible = { schoolId: "school-a", studentId: "student" };
    state.records.enrollments = [
      { class_group_id: "group", enrolled_on: "2026-09-01", ended_on: null, status: "transferred" },
    ];
    expect(await loadAcademicAgendaForRequest(range, context)).toEqual([]);
  });
  it("propagates database failures instead of an empty successful calendar", async () => {
    state.error = { message: "connection refused" };
    await expect(loadAcademicAgendaForRequest(range, context)).rejects.toThrow();
  });
  it("requires MFA before any event write", async () => {
    await expect(
      (saveAcademicAgendaEvent as unknown as Handler)({
        data: {},
        context: { ...context, claims: { aal: "aal1" } },
      }),
    ).rejects.toThrow(/2FA/);
    expect(state.db.from).not.toHaveBeenCalled();
  });
  it("uses school and version on cancellation, rejecting stale updates", async () => {
    state.saved = null;
    await expect(
      (cancelAcademicAgendaEvent as unknown as Handler)({
        data: { id: "event", expectedVersion: 2 },
        context,
      }),
    ).rejects.toThrow(/outra pessoa/);
    expect(state.writeGuard).toHaveBeenCalled();
    expect(filters).toContainEqual(["siga_calendar_events", "school_id", "school-a"]);
    expect(filters).toContainEqual(["siga_calendar_events", "version", 2]);
    expect(filters).toContainEqual(["siga_calendar_events", "status", "published"]);
  });
});
