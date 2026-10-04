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

describe("/professor/presenca", () => {
  it("mostra loading e depois os indicadores do dia com as aulas carregadas", async () => {
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
    listMyTeacherLessonOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(
        screen.getByText(/Ainda não existem ocorrências de aula ligadas ao seu vínculo de RH/),
      ).toBeDefined();
    });
  });

  it("mostra o aviso de check-out pendente para uma aula em curso", async () => {
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
