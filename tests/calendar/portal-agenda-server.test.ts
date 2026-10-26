import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  visible: true,
  enrollment: { class_group_id: "class", final_average: 14.5 } as {
    class_group_id: string;
    final_average: number;
  } | null,
  error: null as { message: string } | null,
  db: { from: vi.fn() },
  agenda: vi.fn(),
  resolveStudent: vi.fn(),
  membership: { schoolId: "school", appRole: "Aluno", allAppRoles: ["Aluno"] } as {
    schoolId: string;
    appRole: string;
    allAppRoles: string[];
  } | null,
  ownTeacher: "teacher" as string | null,
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
}));
vi.mock("@/features/academic/own-teacher", () => ({ ownTeacherId: async () => state.ownTeacher }));
vi.mock("@/features/people/teacher-contact-visibility", () => ({
  loadHiddenTeachers: async () => new Set(),
}));
vi.mock("@/features/dashboard/student-access", () => ({
  resolveVisibleStudent: state.resolveStudent,
}));
vi.mock("@/features/calendar/agenda-server", () => ({
  loadAcademicAgendaForRequest: state.agenda,
}));
import {
  loadStudentAgendaForRequest,
  loadStudentTimetableForRequest,
} from "@/features/dashboard/student-agenda";
import {
  getLessonDetail,
  loadTeacherTimetableForRequest,
} from "@/features/academic/timetable-lessons";

const context = { userId: "user", supabase: {} as never };
const filters: unknown[][] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T07:15:00Z"));
  vi.clearAllMocks();
  filters.length = 0;
  state.enrollment = { class_group_id: "class", final_average: 14.5 };
  state.error = null;
  state.membership = { schoolId: "school", appRole: "Aluno", allAppRoles: ["Aluno"] };
  state.ownTeacher = "teacher";
  state.resolveStudent.mockImplementation(async () =>
    state.visible ? { db: state.db, schoolId: "school", studentId: "child" } : null,
  );
  state.visible = true;
  state.agenda.mockResolvedValue([]);
  state.db.from.mockImplementation((table: string) => {
    if (!["enrollments", "class_groups"].includes(table))
      throw new Error(`Consulta fora da agenda: ${table}`);
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (key: string, value: unknown) => {
        filters.push([table, key, value]);
        return query;
      },
      lte: (key: string, value: unknown) => {
        filters.push([table, "lte", key, value]);
        return query;
      },
      or: (value: unknown) => {
        filters.push([table, "or", value]);
        return query;
      },
      maybeSingle: async () => ({
        data: table === "enrollments" ? state.enrollment : { name: "A" },
        error: state.error,
      }),
    };
    return query;
  });
});
afterEach(() => vi.useRealTimers());

function lessonDetailFixture() {
  const records: Record<string, unknown> = {
    timetable_slots: {
      id: "slot",
      class_subject_id: "cs",
      weekday: 1,
      starts_at: "08:00",
      ends_at: "08:45",
      room: "Sala",
      room_id: null,
    },
    class_subjects: { id: "cs", class_group_id: "class", subject_id: "subject", teacher_id: null },
    subjects: { name: "Matemática" },
    class_groups: { name: "A" },
    siga_timetable_slot_details: null,
    siga_class_tasks: [],
  };
  state.db.from.mockImplementation((table: string) => {
    if (!(table in records)) throw new Error(`Consulta não autorizada: ${table}`);
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        filters.push([table, key, value]);
        return query;
      },
      or: () => query,
      order: () => query,
      maybeSingle: async () => ({ data: records[table], error: null }),
      limit: async () => ({ data: records[table], error: null }),
    };
    return query;
  });
}
const detail = getLessonDetail as unknown as (args: {
  data: { slotId: string; studentId?: string };
  context: typeof context;
}) => Promise<{ subjectName: string; canEdit: boolean }>;

describe("portais consomem a agenda autorizada", () => {
  it("mantém turma/média da matrícula em curso e passa o educando explícito", async () => {
    const result = await loadStudentAgendaForRequest({ studentId: "child" }, context);
    expect(result).toMatchObject({ className: "A", average: 14.5, nextLesson: null });
    expect(state.resolveStudent).toHaveBeenCalledWith("user", "child");
    expect(state.agenda).toHaveBeenCalledWith(
      { start: "2026-10-26", end: "2027-01-27", studentId: "child" },
      context,
    );
    expect(filters).toContainEqual(["enrollments", "school_id", "school"]);
    expect(filters).toContainEqual(["enrollments", "student_id", "child"]);
    expect(filters).toContainEqual(["enrollments", "lte", "enrolled_on", "2026-10-26"]);
    expect(filters).toContainEqual([
      "enrollments",
      "or",
      "ended_on.is.null,ended_on.gte.2026-10-26",
    ]);
    expect(filters).toContainEqual(["class_groups", "school_id", "school"]);
  });
  it("não exige matrícula de turma para ler inscrições em unidades curriculares", async () => {
    state.enrollment = null;
    expect(await loadStudentTimetableForRequest({}, context)).toEqual({
      className: null,
      publishedAt: null,
      weekStart: "2026-10-26",
      days: [],
    });
    expect(state.agenda).toHaveBeenCalledWith(
      { start: "2026-10-26", end: "2026-11-02", studentId: "child" },
      context,
    );
  });
  it("não consulta agenda nem matrícula para um educando sem autorização", async () => {
    state.visible = false;
    expect(
      (await loadStudentAgendaForRequest({ studentId: "other" }, context)).nextLesson,
    ).toBeNull();
    expect(state.db.from).not.toHaveBeenCalled();
    expect(state.agenda).not.toHaveBeenCalled();
  });
  it("propaga falhas da matrícula e da agenda sem regressar aos slots brutos", async () => {
    state.error = { message: "connection refused" };
    await expect(loadStudentAgendaForRequest({}, context)).rejects.toThrow(/matrícula/);
    expect(state.agenda).not.toHaveBeenCalled();
    state.error = null;
    state.agenda.mockRejectedValue(new Error("Sem acesso"));
    await expect(loadStudentTimetableForRequest({}, context)).rejects.toThrow("Sem acesso");
  });
  it("limita também o administrador que pede o seu próprio horário de docente", async () => {
    await loadTeacherTimetableForRequest(context);
    expect(state.agenda).toHaveBeenCalledWith(
      { start: "2026-10-26", end: "2026-11-02", teacherId: "teacher" },
      context,
    );
    expect(state.db.from).not.toHaveBeenCalled();
  });
  it("mostra outra semana sem mudar a turma de referência (a de hoje)", async () => {
    // Uma quarta-feira pedida conta como a semana dessa segunda.
    const shown = await loadStudentTimetableForRequest({ weekStart: "2026-11-11" }, context);
    expect(shown.weekStart).toBe("2026-11-09");
    expect(state.agenda).toHaveBeenLastCalledWith(
      { start: "2026-11-09", end: "2026-11-16", studentId: "child" },
      context,
    );
    expect(filters).toContainEqual(["enrollments", "lte", "enrolled_on", "2026-10-26"]);
    await loadTeacherTimetableForRequest(context, { weekStart: "2026-10-19" });
    expect(state.agenda).toHaveBeenLastCalledWith(
      { start: "2026-10-19", end: "2026-10-26", teacherId: "teacher" },
      context,
    );
  });
  it("recusa uma semana que não é uma data", async () => {
    const { timetableWeekSchema } = await import("@/features/dashboard/student-agenda");
    expect(timetableWeekSchema.safeParse("2026-13-45").success).toBe(false);
    expect(timetableWeekSchema.safeParse("amanhã").success).toBe(false);
    expect(timetableWeekSchema.safeParse("2026-11-09").success).toBe(true);
    expect(timetableWeekSchema.safeParse(undefined).success).toBe(true);
  });
  it("não carrega agenda se a conta não for docente nesta escola", async () => {
    state.ownTeacher = null;
    expect((await loadTeacherTimetableForRequest(context)).days).toEqual([]);
    expect(state.agenda).not.toHaveBeenCalled();
  });
  it("mantém a recusa do grant pedagógico no horário do professor", async () => {
    state.agenda.mockRejectedValue(new Error("Sem acesso ao módulo"));
    await expect(loadTeacherTimetableForRequest(context)).rejects.toThrow(/módulo/);
  });
  it("abre os detalhes da cadeira autorizada sem exigir matrícula de turma", async () => {
    lessonDetailFixture();
    state.agenda.mockResolvedValue([
      { extendedProps: { source: "lesson", sourceId: "slot@2026-10-26" } },
    ]);
    expect(await detail({ data: { slotId: "slot" }, context })).toMatchObject({
      subjectName: "Matemática",
      canEdit: false,
    });
    expect(state.agenda).toHaveBeenCalledWith(
      { start: "2026-10-26", end: "2027-01-27", classGroupId: "class", studentId: "child" },
      context,
    );
    expect(state.db.from.mock.calls.map(([table]) => table)).not.toContain("enrollments");
    for (const [table] of state.db.from.mock.calls)
      expect(filters).toContainEqual([table, "school_id", "school"]);
  });
  it("recusa acesso por ID a uma aula que a agenda do educando não autoriza", async () => {
    lessonDetailFixture();
    state.agenda.mockResolvedValue([
      { extendedProps: { source: "lesson", sourceId: "other-slot@2026-10-26" } },
    ]);
    await expect(detail({ data: { slotId: "slot" }, context })).rejects.toThrow(/não encontrada/);
    expect(state.db.from.mock.calls.map(([table]) => table)).toEqual([
      "timetable_slots",
      "class_subjects",
    ]);
  });
  it("não usa privilégios de edição no pedido explícito de um educando", async () => {
    lessonDetailFixture();
    state.membership = {
      schoolId: "school",
      appRole: "Encarregado",
      allAppRoles: ["Encarregado", "Administrador"],
    };
    state.agenda.mockResolvedValue([
      { extendedProps: { source: "lesson", sourceId: "slot@2026-10-26" } },
    ]);
    expect((await detail({ data: { slotId: "slot", studentId: "child" }, context })).canEdit).toBe(
      false,
    );
  });
  it("recusa detalhes se o educando resolvido pertencer a outra escola", async () => {
    lessonDetailFixture();
    state.resolveStudent.mockResolvedValue({
      db: state.db,
      schoolId: "other-school",
      studentId: "child",
    });
    await expect(detail({ data: { slotId: "slot" }, context })).rejects.toThrow(/não encontrada/);
    expect(state.agenda).not.toHaveBeenCalled();
  });
});
