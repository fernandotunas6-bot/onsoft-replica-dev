import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  guard: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  sync: vi.fn(),
  notify: vi.fn(),
  schedule: { id: "schedule", valid_from: "2026-10-26", version_number: 1 },
  published: { id: "schedule" } as { id: string } | null,
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  requireSgaWriterForWrite: mock.guard,
  loadSgaAdminClient: async () => ({ rpc: mock.rpc, from: mock.from }),
}));
vi.mock("@/features/calendar/agenda-sessions", () => ({ syncAcademicAgendaToSessions: mock.sync }));
vi.mock("@/features/academic/timetable-lessons", () => ({ notifySchedulePublished: mock.notify }));
import {
  publishAcademicScheduleForRequest,
  resyncAcademicScheduleForRequest,
} from "@/features/academic/schedule-publication";
import { publishAcademicScheduleInputSchema } from "@/features/academic/schemas";
const context = { userId: "actor", supabase: {} as never, claims: { sub: "actor", aal: "aal2" } };
const data = { classGroupId: "group", academicYearId: "year", syncToCalendar: true };
const filters: Array<[string, unknown]> = [];
beforeEach(() => {
  vi.clearAllMocks();
  filters.length = 0;
  mock.published = { id: "schedule" };
  mock.guard.mockResolvedValue({ schoolId: "school", appRole: "Administrador" });
  mock.rpc.mockResolvedValue({ data: mock.schedule, error: null });
  mock.sync.mockResolvedValue(4);
  mock.notify.mockResolvedValue(2);
  mock.from.mockImplementation(() => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      },
      is: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: mock.published, error: null }),
    };
    return query;
  });
});
describe("atomic timetable publication", () => {
  it("requires MFA before publishing", async () => {
    await expect(
      publishAcademicScheduleForRequest(data, {
        ...context,
        claims: { sub: "actor", aal: "aal1" },
      }),
    ).rejects.toThrow(/2FA/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("uses one authorized RPC, then attendance and notifications", async () => {
    expect(
      await publishAcademicScheduleForRequest({ ...data, validFrom: "2026-10-26" }, context),
    ).toMatchObject({ success: true, generatedSessions: 4, notified: 2 });
    expect(mock.guard).toHaveBeenCalledWith("pedagogica", context.supabase, "actor", [
      "Administrador",
      "Secretaria",
    ]);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("publish_academic_schedule_atomic", {
      p_school_id: "school",
      p_class_group_id: "group",
      p_academic_year_id: "year",
      p_actor: "actor",
      p_valid_from: "2026-10-26",
    });
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.sync.mock.invocationCallOrder[0]).toBeGreaterThan(
      mock.rpc.mock.invocationCallOrder[0],
    );
    expect(mock.notify.mock.invocationCallOrder[0]).toBeGreaterThan(
      mock.sync.mock.invocationCallOrder[0],
    );
  });
  it("retries a rolled-back deadlock without repeating post-commit side effects", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "40P01", message: "deadlock" } });
    await publishAcademicScheduleForRequest(data, context);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.sync).toHaveBeenCalledTimes(1);
    expect(mock.notify).toHaveBeenCalledTimes(1);
  });
  it("does not retry a business error or run side effects after failure", async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "A carga semanal do horário não corresponde às disciplinas da turma.",
      },
    });
    await expect(publishAcademicScheduleForRequest(data, context)).rejects.toThrow(/carga semanal/);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.sync).not.toHaveBeenCalled();
    expect(mock.notify).not.toHaveBeenCalled();
  });
  it("does not retry an uncertain network failure", async () => {
    mock.rpc.mockRejectedValue(new Error("network failed"));
    await expect(publishAcademicScheduleForRequest(data, context)).rejects.toThrow(/network/);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("reports attendance failure honestly after the schedule committed", async () => {
    mock.sync.mockRejectedValue(new Error("failed"));
    await expect(publishAcademicScheduleForRequest(data, context)).rejects.toThrow(
      /horário foi publicado/,
    );
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("allows attendance sync to retry without publishing another version", async () => {
    expect(await resyncAcademicScheduleForRequest(data, context)).toEqual({
      scheduleId: "schedule",
      generatedSessions: 4,
    });
    expect(filters).toEqual(
      expect.arrayContaining([
        ["school_id", "school"],
        ["class_group_id", "group"],
        ["academic_year_id", "year"],
        ["status", "published"],
      ]),
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("does not sync an unpublished class", async () => {
    mock.published = null;
    await expect(resyncAcademicScheduleForRequest(data, context)).rejects.toThrow(
      /Não existe um horário publicado/,
    );
    expect(mock.sync).not.toHaveBeenCalled();
  });
  it("rejects nonexistent and inverted publication dates", () => {
    const input = {
      classGroupId: "11111111-1111-4111-8111-111111111111",
      academicYearId: "22222222-2222-4222-8222-222222222222",
    };
    expect(
      publishAcademicScheduleInputSchema.safeParse({ ...input, validFrom: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      publishAcademicScheduleInputSchema.safeParse({
        ...input,
        validFrom: "2026-10-27",
        validTo: "2026-10-26",
      }).success,
    ).toBe(false);
  });
});
