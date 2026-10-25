// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Emissão de QR de presença docente, em `/pedagogica/presenca-docente`.
 *
 * A emissão esteve duplicada: uma cópia em `/financeiro/rh` e esta, a única
 * que sincroniza o horário. Os dois casos abaixo vieram de
 * `financeiro-rh.test.tsx` quando a cópia saiu — o QR é um desafio temporário
 * de uso único, e ficar sem teste era perder a única rede que tinha.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listTeacherQrOccurrencesMock = vi.fn();
const createTeacherLessonQrMock = vi.fn();
const materializeTeacherLessonsMock = vi.fn();

vi.mock("@/features/hr/teacher-lessons", () => ({
  listTeacherQrOccurrences: () => listTeacherQrOccurrencesMock(),
  createTeacherLessonQr: (input: unknown) => createTeacherLessonQrMock(input),
}));

vi.mock("@/features/hr/materialize-lessons", () => ({
  materializeTeacherLessons: (input: unknown) => materializeTeacherLessonsMock(input),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const scheduledOccurrence = {
  id: "occ-1",
  teacherId: "teacher-1",
  teacherName: "Ana Vieira",
  lessonDate: "2026-09-10",
  startsAt: "08:00:00",
  endsAt: "09:00:00",
  actualStartedAt: null,
  actualEndedAt: null,
  status: "scheduled",
  classGroupName: "10ª A",
  subjectName: "Matemática",
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/pedagogica_.presenca-docente");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/pedagogica/presenca-docente", () => {
  it("mostra o estado vazio quando não há ocorrências sincronizadas", async () => {
    listTeacherQrOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Sem ocorrências docentes sincronizadas")).toBeDefined();
    });
  });

  it("gera o QR de entrada ao clicar em 'QR entrada' numa aula agendada", async () => {
    listTeacherQrOccurrencesMock.mockResolvedValue([scheduledOccurrence]);
    createTeacherLessonQrMock.mockResolvedValue({
      token: "token-de-teste",
      purpose: "check_in",
      expiresAt: "2026-09-10T08:05:00Z",
    });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ana Vieira")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /QR entrada/ }));

    await waitFor(() => {
      expect(createTeacherLessonQrMock).toHaveBeenCalledWith({
        data: { occurrenceId: "occ-1", purpose: "check_in" },
      });
    });

    // A imagem vem de QRCode.toDataURL — real, sem mock — para apanhar um QR
    // que chegue ao ecrã em branco.
    await waitFor(() => {
      const img = screen.getByRole("img", { name: /QR temporário de entrada/ });
      expect(img.getAttribute("style")).toMatch(/data:image\/png;base64,/);
    });
  });
});
