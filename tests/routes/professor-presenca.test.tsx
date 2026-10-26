// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, resetRouteLocation } from "./_harness";
import type { HrTeacherLessonOccurrence } from "@/features/hr/teacher-lessons";
import { schoolTodayIso } from "@/features/hr/schoolClock";

/**
 * Testes de montagem e render de `/professor/presenca`.
 *
 * `TeacherAttendancePanel` só chama o servidor para listar as próprias
 * ocorrências (`listMyTeacherLessonOccurrences`); o diálogo de chamada só
 * monta quando `initialCall` traz `sessionId`/`classGroupId` (nenhum teste
 * aqui usa a query `?chamada=1`, por isso fica sempre fechado) e a câmara só
 * é acedida por interacção — a rota monta em segurança sem `getUserMedia`.
 *
 * Valida:
 * 1. Transição de loading para carregado com os indicadores do dia.
 * 2. Estado vazio quando o professor não tem ocorrências ligadas.
 * 3. Aula "em curso" sem check-out mostra o aviso e muda o modo de leitura
 *    do QR automaticamente para saída (efeito derivado do id da aula).
 * 4. Ramo de erro da API.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listMyTeacherLessonOccurrencesMock = vi.fn();

const listTeacherAttendanceSessionsMock = vi.fn();
const confirmTeacherLessonPresenceMock = vi.fn();

vi.mock("@/features/pedagogica/attendance-server", () => ({
  listTeacherAttendanceSessions: (input: unknown) => listTeacherAttendanceSessionsMock(input),
  getAttendanceCallSheet: vi.fn(),
  editFinalizedAttendanceCall: vi.fn(),
  submitAttendanceCallBatchInputSchema: {},
}));

vi.mock("@/features/pedagogica/teacher-presence-server", () => ({
  confirmTeacherLessonPresence: (input: unknown) => confirmTeacherLessonPresenceMock(input),
}));

vi.mock("@/features/hr/teacher-lessons", () => ({
  listMyTeacherLessonOccurrences: () => listMyTeacherLessonOccurrencesMock(),
  openMyLessonClassroom: vi.fn(),
  redeemTeacherLessonQr: vi.fn(),
}));

// A data da escola (Luanda), a mesma do ecrã: entre as 23h e a meia-noite UTC a data
// UTC já é a de ontem em Luanda.
const today = schoolTodayIso(new Date());

const scheduledLesson: HrTeacherLessonOccurrence = {
  id: "occ-1",
  teacher_id: "teacher-1",
  employment_id: "emp-1",
  lesson_date: today,
  scheduled_starts_at: "08:00:00",
  scheduled_ends_at: "09:00:00",
  actual_started_at: null,
  actual_ended_at: null,
  quantity: 1,
  status: "scheduled",
  evidence_method: null,
  evidence_ref: null,
  compensation_event_id: null,
  class_subject_id: "cs-1",
  class_group_id: "cg-1",
  class_group_name: "10ª A",
  subject_id: "sub-1",
  subject_name: "Matemática",
  attendance_session_id: null,
};

const awaitingCheckoutLesson: HrTeacherLessonOccurrence = {
  ...scheduledLesson,
  id: "occ-2",
  class_group_name: "11ª B",
  subject_name: "Física",
  actual_started_at: `${today}T08:05:00Z`,
  actual_ended_at: null,
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/professor.presenca");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
});

const noLessonsToday = {
  sessions: [],
  date: today,
  pendingCount: 0,
  presenceEnabled: null,
  viewerIsTeacher: true,
};

function presenceSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    class_group_id: "cg-1",
    class_group_name: "12ª C",
    subject_id: "sub-1",
    subject_name: "Química",
    timetable_slot_id: "slot-1",
    // A aula decorre durante todo o dia de hoje: a janela está sempre aberta.
    starts_at: "00:00:00",
    ends_at: "23:59:00",
    room: "4",
    status: "pending",
    lesson_date: today,
    teacher_id: "teacher-1",
    teacher_name: null,
    teacher_presence: {
      teacher_checked_in_at: null,
      teacher_checkin_method: null,
      teacher_late_minutes: null,
      teacher_checked_out_at: null,
      teacher_presence_note: null,
    },
    ...overrides,
  };
}

describe("/professor/presenca", () => {
  it("mostra loading e depois os indicadores do dia com as aulas carregadas", async () => {
    listTeacherAttendanceSessionsMock.mockResolvedValue(noLessonsToday);
    listMyTeacherLessonOccurrencesMock.mockResolvedValue([scheduledLesson]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar presenças/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("10ª A · Matemática")).toBeDefined();
    });
    // "Aulas hoje" == 1 (a única ocorrência é de hoje).
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("Aguardando check-in")).toBeDefined();
  });

  it("mostra o estado vazio quando o professor não tem ocorrências ligadas", async () => {
    listTeacherAttendanceSessionsMock.mockResolvedValue(noLessonsToday);
    listMyTeacherLessonOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText(/Sem aulas de hora\/aula no RH/)).toBeDefined();
    });
    expect(screen.getByText(/Sem aulas suas no horário de hoje/)).toBeDefined();
  });

  it("sem contrato de RH, confirma «Estou na sala» na aula de hoje", async () => {
    listTeacherAttendanceSessionsMock.mockResolvedValue({
      ...noLessonsToday,
      presenceEnabled: true,
      sessions: [presenceSession()],
    });
    listMyTeacherLessonOccurrencesMock.mockResolvedValue([]);
    confirmTeacherLessonPresenceMock.mockResolvedValue({
      sessionId: "11111111-1111-4111-8111-111111111111",
      alreadyRecorded: false,
      presence: {
        teacher_checked_in_at: new Date().toISOString(),
        teacher_checkin_method: "portal",
        teacher_late_minutes: 0,
        teacher_checked_out_at: null,
        teacher_presence_note: null,
      },
    });

    const Page = await loadPage();
    renderRoute(Page);

    const button = await screen.findByRole("button", { name: /Estou na sala/ });
    expect(screen.getByText("Por confirmar")).toBeDefined();
    button.click();
    await waitFor(() => {
      expect(confirmTeacherLessonPresenceMock).toHaveBeenCalledWith({
        data: { sessionId: "11111111-1111-4111-8111-111111111111", action: "check_in" },
      });
    });
  });

  it("mostra a presença já confirmada e oferece terminar a aula", async () => {
    listTeacherAttendanceSessionsMock.mockResolvedValue({
      ...noLessonsToday,
      presenceEnabled: true,
      sessions: [
        presenceSession({
          teacher_presence: {
            teacher_checked_in_at: `${today}T07:03:00Z`,
            teacher_checkin_method: "portal",
            teacher_late_minutes: 0,
            teacher_checked_out_at: null,
            teacher_presence_note: null,
          },
        }),
      ],
    });
    listMyTeacherLessonOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Professor na sala");
    expect(screen.getByText(/desde 08:03 · confirmada pelo professor/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Terminar aula/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Estou na sala/ })).toBeNull();
  });

  it("mostra o aviso de check-out pendente para uma aula em curso", async () => {
    listTeacherAttendanceSessionsMock.mockResolvedValue(noLessonsToday);
    listMyTeacherLessonOccurrencesMock.mockResolvedValue([awaitingCheckoutLesson]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Aula em curso — falta o check-out")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /Ler QR de saída/ })).toBeDefined();
    expect(screen.getByText("Em curso — falta check-out")).toBeDefined();
  });

  it("mostra o ramo de erro quando a API falha", async () => {
    listTeacherAttendanceSessionsMock.mockResolvedValue(noLessonsToday);
    listMyTeacherLessonOccurrencesMock.mockRejectedValue(
      new Error("Não foi possível carregar as presenças."),
    );

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Não foi possível carregar as presenças.")).toBeDefined();
    });
  });
});
