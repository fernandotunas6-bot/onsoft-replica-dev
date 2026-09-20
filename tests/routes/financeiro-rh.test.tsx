// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { HrDashboardData } from "@/features/hr/server";
import type { HrTeacherLessonOccurrence } from "@/features/hr/teacher-lessons";

/**
 * Testes de montagem e render de `/financeiro/rh`.
 *
 * Valida os fluxos essenciais do resumo de RH:
 * 1. Transição de loading para carregado com os indicadores da StatGrid.
 * 2. Contingência de esquema em falta (`ready: false`) a substituir os
 *    indicadores por um aviso de migração — os totais a zero seriam lidos
 *    como resultado real da escola.
 * 3. Estado vazio de ocorrências de aula (QR de presença docente).
 * 4. Geração de QR de check-in a partir de uma ocorrência agendada.
 * 5. Ramo de erro do dashboard — colapsa a página inteira num único painel.
 * 6. Estado vazio de folhas salariais quando o dashboard carrega sem erro.
 */

type Payroll = Awaited<ReturnType<typeof import("@/features/hr/server").listHrPayrollRuns>>[number];

// 5s por omissão aperta quando a pasta inteira corre em paralelo (vários
// forks a competer por CPU) — mesma mitigação de faturas.test.tsx e
// documentos.test.tsx.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const getHrDashboardMock = vi.fn();
const listHrPayrollRunsMock = vi.fn();
const listHrTeacherLessonOccurrencesMock = vi.fn();
const createTeacherLessonQrMock = vi.fn();

vi.mock("@/features/hr/server", () => ({
  getHrDashboard: () => getHrDashboardMock(),
  listHrPayrollRuns: () => listHrPayrollRunsMock(),
}));

vi.mock("@/features/hr/teacher-lessons", () => ({
  listHrTeacherLessonOccurrences: () => listHrTeacherLessonOccurrencesMock(),
  createTeacherLessonQr: (input: unknown) => createTeacherLessonQrMock(input),
}));

const readyDashboard: HrDashboardData = {
  ready: true,
  employeeCount: 12,
  activeContractCount: 10,
  payrollDraftCount: 1,
  latestPayroll: {
    id: "run-1",
    competence_year: 2026,
    competence_month: 8,
    status: "paid",
    total_gross_kz: 1200000,
    total_deductions_kz: 150000,
    total_net_kz: 1050000,
  },
};

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

const samplePayroll: Payroll = {
  id: "run-1",
  competence_year: 2026,
  competence_month: 8,
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  status: "paid",
  total_gross_kz: 1200000,
  total_deductions_kz: 150000,
  total_net_kz: 1050000,
  approved_at: "2026-08-28T00:00:00Z",
  paid_at: "2026-08-30T00:00:00Z",
} as Payroll;

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/financeiro.rh");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/financeiro/rh", () => {
  it("mostra loading e depois os indicadores carregados", async () => {
    getHrDashboardMock.mockResolvedValue(readyDashboard);
    listHrPayrollRunsMock.mockResolvedValue([samplePayroll]);
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar ocorrências de aulas/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("12")).toBeDefined();
    });
    expect(screen.getByText("10")).toBeDefined();
    // Formatação exacta do kwanza (separadores, ICU) não é o objecto deste
    // teste — confirma-se apenas que o valor chegou ao ecrã. Aparece duas
    // vezes: no indicador "Último líquido" e na linha da tabela de folhas.
    expect(
      screen.getAllByText((text) => /Kz/.test(text) && /1.?050.?000/.test(text)).length,
    ).toBeGreaterThan(0);
  });

  it("substitui os indicadores por um aviso quando o esquema de RH não está pronto", async () => {
    getHrDashboardMock.mockResolvedValue({
      ready: false,
      employeeCount: 0,
      activeContractCount: 0,
      payrollDraftCount: 0,
      latestPayroll: null,
    } satisfies HrDashboardData);
    listHrPayrollRunsMock.mockResolvedValue([]);
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Fundação do RH pronta para migração")).toBeDefined();
    });
    // Os indicadores não devem aparecer — zeros seriam lidos como dado real.
    expect(screen.queryByText("Funcionários activos")).toBeNull();
  });

  it("mostra o estado vazio de ocorrências de aula quando não há nenhuma", async () => {
    getHrDashboardMock.mockResolvedValue(readyDashboard);
    listHrPayrollRunsMock.mockResolvedValue([samplePayroll]);
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem ocorrências de aula")).toBeDefined();
    });
  });

  it("gera o QR de check-in ao clicar em 'QR entrada' para uma aula agendada", async () => {
    getHrDashboardMock.mockResolvedValue(readyDashboard);
    listHrPayrollRunsMock.mockResolvedValue([samplePayroll]);
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([scheduledOccurrence]);
    createTeacherLessonQrMock.mockResolvedValue({
      token: "opaque-qr-token",
      purpose: "check_in",
      expiresAt: "2026-09-10T08:05:00Z",
    });

    const Page = await loadPage();
    renderRoute(Page);

    const button = await screen.findByRole("button", { name: /QR entrada/ });
    fireEvent.click(button);

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

  it("substitui toda a página por um único painel de erro quando o dashboard falha", async () => {
    // O componente é um if/else-if/else único: um erro no `dashboard` não
    // deixa as secções de aulas/folhas por baixo — a página inteira colapsa
    // no painel "Acesso ao RH". Vale a pena fixar isto: mudar a estrutura
    // para painéis independentes é uma escolha visível para quem usa RH.
    getHrDashboardMock.mockRejectedValue(new Error("Sem permissão para consultar dados de RH."));
    listHrPayrollRunsMock.mockResolvedValue([samplePayroll]);
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([scheduledOccurrence]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Sem permissão para consultar dados de RH.")).toBeDefined();
    });
    expect(screen.queryByText("Ainda não existem folhas salariais.")).toBeNull();
    expect(screen.queryByText(String(samplePayroll.status))).toBeNull();
  });

  it("mostra o estado vazio de folhas salariais quando o dashboard carrega mas não há folhas", async () => {
    getHrDashboardMock.mockResolvedValue(readyDashboard);
    listHrPayrollRunsMock.mockResolvedValue([]);
    listHrTeacherLessonOccurrencesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem folhas salariais.")).toBeDefined();
    });
  });
});
