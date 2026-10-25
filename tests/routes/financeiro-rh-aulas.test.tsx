// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { HrTeacherLessonOccurrence } from "@/features/hr/teacher-lessons";

/**
 * Testes de `/financeiro/rh/aulas` — a página de assiduidade docente onde
 * passou a viver a emissão do QR de presença que antes abria por cima da
 * folha salarial em `/financeiro/rh`.
 *
 * Cobre o que o utilizador vê e faz nesta finalidade única:
 * 1. Estado vazio de ocorrências de aula.
 * 2. Emissão do QR de check-in a partir de uma ocorrência agendada.
 * 3. Emissão do QR de check-out quando a aula já tem check-in.
 * 4. Ramo de erro do carregamento das ocorrências.
 */

// 5s por omissão aperta quando a pasta inteira corre em paralelo — mesma
// mitigação de financeiro-rh.test.tsx e faturas.test.tsx.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listHrTeacherLessonOccurrencesMock = vi.fn();
const createTeacherLessonQrMock = vi.fn();

vi.mock("@/features/hr/teacher-lessons", () => ({
  listHrTeacherLessonOccurrences: () => listHrTeacherLessonOccurrencesMock(),
  createTeacherLessonQr: (input: unknown) => createTeacherLessonQrMock(input),
}));

const scheduledOccurrence: HrTeacherLessonOccurrence = {
  id: "occ-1",
  teacher_id: "teacher-1",
  employment_id: "emp-1",
  lesson_date: "2026-09-10",
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

const checkedInOccurrence: HrTeacherLessonOccurrence = {
  ...scheduledOccurrence,
  id: "occ-2",
  actual_started_at: "2026-09-10T08:02:00Z",
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/financeiro.rh.aulas");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/financeiro/rh/aulas", () => {
  it("mostra o estado vazio quando não existem ocorrências de aula", async () => {
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar ocorrências de aulas/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem ocorrências de aula")).toBeDefined();
    });
  });

  it("gera o QR de check-in ao clicar em 'QR entrada' para uma aula agendada", async () => {
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([scheduledOccurrence]);
    createTeacherLessonQrMock.mockResolvedValue({
      token: "opaque-qr-token",
      purpose: "check_in",
      expiresAt: "2026-09-10T08:05:00Z",
    });

    const Page = await loadPage();
    renderRoute(Page);

    fireEvent.click(await screen.findByRole("button", { name: /QR entrada/ }));

    await waitFor(() => {
      expect(createTeacherLessonQrMock).toHaveBeenCalledWith({
        data: { occurrenceId: "occ-1", purpose: "check_in" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Check-in da aula")).toBeDefined();
    });
    // A imagem do QR vem de QRCode.toDataURL — real, sem mock — asseverar que
    // gerou uma data URL válida em vez de ficar em branco.
    const img = screen.getByRole("img", { name: /QR temporário de check-in/ });
    expect(img.getAttribute("style")).toMatch(/data:image\/png;base64,/);
  });

  it("gera o QR de check-out quando a aula já tem check-in", async () => {
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([checkedInOccurrence]);
    createTeacherLessonQrMock.mockResolvedValue({
      token: "opaque-qr-token",
      purpose: "check_out",
      expiresAt: "2026-09-10T09:35:00Z",
    });

    const Page = await loadPage();
    renderRoute(Page);

    fireEvent.click(await screen.findByRole("button", { name: /QR saída/ }));

    await waitFor(() => {
      expect(createTeacherLessonQrMock).toHaveBeenCalledWith({
        data: { occurrenceId: "occ-2", purpose: "check_out" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Check-out da aula")).toBeDefined();
    });
  });

  it("mostra o erro quando as ocorrências de aula não carregam", async () => {
    listHrTeacherLessonOccurrencesMock.mockRejectedValue(
      new Error("Sem permissão para consultar aulas."),
    );

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Sem permissão para consultar aulas.")).toBeDefined();
    });
  });
});
