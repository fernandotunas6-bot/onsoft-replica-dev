import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  agenda: vi.fn(),
  guard: vi.fn(),
  db: { from: vi.fn() },
  upsert: vi.fn(),
  teacherId: "teacher" as string | null,
  sessions: [] as Array<{
    id: string;
    timetable_slot_id: string;
    lesson_date: string;
    status: string;
  }>,
  readError: null as { message: string } | null,
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
  requireSgaWriterFor: state.guard,
}));
vi.mock("@/integrations/supabase/paged-client", () => ({ pagedReadClient: (db: unknown) => db }));
vi.mock("@/features/auth/server", () => ({
  resolveUserLinkedEntities: async () => ({ teacher_id: state.teacherId }),
}));
vi.mock("@/features/arquivos/server", () => ({
  loadShareableSchoolFile: vi.fn(),
  signChatAttachmentFile: vi.fn(),
}));
vi.mock("@/features/calendar/agenda-server", () => ({
  loadAcademicAgendaForRequest: state.agenda,
}));
import {
  listTeacherAttendanceSessions,
  listTeacherAttendanceSessionsInputSchema,
} from "@/features/pedagogica/attendance-server";

const context = { userId: "user", supabase: {} as never };
const handler = listTeacherAttendanceSessions as unknown as (args: {
  data: { date: string };
  context: typeof context;
}) => Promise<{
  sessions: Array<{ id: string; starts_at: string; room: string; status: string }>;
  pendingCount: number;
}>;
const request = { data: { date: "2026-11-01" }, context };
const filters: unknown[][] = [];
beforeEach(() => {
  vi.clearAllMocks();
  filters.length = 0;
  state.teacherId = "teacher";
  state.sessions = [];
  state.readError = null;
  state.guard.mockResolvedValue({ schoolId: "school", appRole: "Professor" });
  state.agenda.mockResolvedValue([
    {
      start: "2026-11-01T08:00:00+01:00",
      end: "2026-11-01T08:45:00+01:00",
      extendedProps: {
        source: "lesson",
        sourceId: "slot@2026-11-01",
        classSubjectId: "cs",
        academicYearId: "year",
        room: "Laboratório",
      },
    },
  ]);
  state.upsert.mockReset();
  state.upsert.mockImplementation(
    async (rows: typeof state.sessions, options: { ignoreDuplicates: boolean }) => {
      expect(options.ignoreDuplicates).toBe(true);
      for (const row of rows) {
        if (
          !state.sessions.some(
            (s) =>
              s.timetable_slot_id === row.timetable_slot_id && s.lesson_date === row.lesson_date,
          )
        )
          state.sessions.push({ ...row, id: "session" });
      }
      return { error: null };
    },
  );
  state.db.from.mockImplementation((table: string) => {
    const records: Record<string, unknown> = {
      class_subjects: [
        { id: "cs", class_group_id: "group", subject_id: "subject", teacher_id: "teacher" },
      ],
      class_groups: [{ id: "group", name: "A" }],
      subjects: [{ id: "subject", name: "Matemática" }],
      siga_attendance_sessions: state.sessions,
    };
    if (!(table in records)) throw new Error(`Consulta fora da agenda: ${table}`);
    const query = {
      select: () => query,
      order: () => query,
      eq: (key: string, value: unknown) => {
        filters.push([table, key, value]);
        return query;
      },
      in: () => query,
      upsert: state.upsert,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(
          resolve({
            data: records[table],
            error: table === "siga_attendance_sessions" ? state.readError : null,
          }),
        ),
    };
    return query;
  });
});

describe("chamada usa a agenda publicada", () => {
  it("prepara a ocorrência de domingo com ano lectivo, sala e identificador da sessão", async () => {
    const result = await handler(request);
    expect(result.sessions).toEqual([
      expect.objectContaining({
        id: "session",
        starts_at: "08:00:00",
        room: "Laboratório",
        status: "pending",
      }),
    ]);
    expect(result.pendingCount).toBe(1);
    expect(state.agenda).toHaveBeenCalledWith(
      { start: "2026-11-01", end: "2026-11-02", classGroupId: undefined },
      context,
    );
    expect(state.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          school_id: "school",
          academic_year_id: "year",
          timetable_slot_id: "slot",
          lesson_date: "2026-11-01",
        }),
      ],
      { onConflict: "school_id,timetable_slot_id,lesson_date", ignoreDuplicates: true },
    );
    for (const [table] of state.db.from.mock.calls)
      expect(filters).toContainEqual([table, "school_id", "school"]);
  });
  it("não cria sessões quando a agenda só contém feriados ou interrupções", async () => {
    state.agenda.mockResolvedValue([{ extendedProps: { source: "holiday" } }]);
    expect(await handler(request)).toEqual({ sessions: [], date: "2026-11-01", pendingCount: 0 });
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("mantém a sessão concluída e não a volta a escrever", async () => {
    state.sessions = [
      {
        id: "completed",
        timetable_slot_id: "slot",
        lesson_date: "2026-11-01",
        status: "completed",
      },
    ];
    const result = await handler(request);
    expect(result.sessions[0]).toMatchObject({ id: "completed", status: "completed" });
    expect(result.pendingCount).toBe(0);
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("pedidos simultâneos reutilizam o mesmo identificador sem duplicar sessões", async () => {
    const results = await Promise.all([handler(request), handler(request)]);
    expect(results.map((r) => r.sessions[0].id)).toEqual(["session", "session"]);
    expect(state.sessions).toHaveLength(1);
  });
  it("não alarga a escola inteira quando falta a ficha do professor", async () => {
    state.teacherId = null;
    expect((await handler(request)).sessions).toEqual([]);
    expect(state.agenda).not.toHaveBeenCalled();
  });
  it("interrompe a preparação se a leitura das sessões falhar", async () => {
    state.readError = { message: "connection refused" };
    await expect(handler(request)).rejects.toThrow(/verificar/);
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("não devolve o ID de um slot como se a escrita tivesse criado uma sessão", async () => {
    state.upsert.mockResolvedValue({ error: null });
    await expect(handler(request)).rejects.toThrow(/confirmar/);
  });
  it("recusa datas civis inexistentes antes da consulta", () => {
    expect(listTeacherAttendanceSessionsInputSchema.safeParse({ date: "2026-02-30" }).success).toBe(
      false,
    );
  });
});
