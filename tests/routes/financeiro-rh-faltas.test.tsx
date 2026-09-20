// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { HrAbsenceReviewRow } from "@/features/hr/absences";

/**
 * Testes de montagem e render de `/financeiro/rh/faltas`.
 *
 * Valida a fila de revisão de assiduidade:
 * 1. Transição de loading para carregado com os indicadores (StatGrid).
 * 2. Estado vazio — o título muda consoante o filtro activo, e o filtro
 *    "pending" (omissão) não mostra o atalho "Ver faltas pendentes" porque
 *    já é o próprio filtro.
 * 3. Ramo de erro da API.
 * 4. Decisão de validação: preencher a justificação habilita "Validar" e
 *    chama `reviewHrAbsence` com `decision: "validate"`.
 * 5. Uma falta já revista (não `pending`) fica sem controlos de decisão.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listHrAbsencesForReviewMock = vi.fn();
const reviewHrAbsenceMock = vi.fn();

vi.mock("@/features/hr/absences", () => ({
  listHrAbsencesForReview: () => listHrAbsencesForReviewMock(),
  reviewHrAbsence: (input: unknown) => reviewHrAbsenceMock(input),
}));

const pendingAbsence: HrAbsenceReviewRow = {
  id: "abs-1",
  employmentId: "emp-1",
  contractId: "con-1",
  personName: "Joana Mendes",
  employeeNumber: "FUNC-004",
  absenceDate: "2026-09-08",
  absenceType: "unjustified",
  durationMinutes: 120,
  reason: null,
  evidenceRef: null,
  validationStatus: "pending",
  estimatedDeductionKz: 5000,
  remunerationModel: "fixed_deduct_absence",
};

const validatedAbsence: HrAbsenceReviewRow = {
  ...pendingAbsence,
  id: "abs-2",
  personName: "Carlos Neto",
  validationStatus: "validated",
  reason: "Declaração médica apresentada",
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/financeiro.rh.faltas");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/financeiro/rh/faltas", () => {
  it("mostra loading e depois os indicadores e a fila de faltas pendentes", async () => {
    listHrAbsencesForReviewMock.mockResolvedValue([pendingAbsence, validatedAbsence]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar faltas/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Joana Mendes")).toBeDefined();
    });
    // Filtro por omissão é "pending" — a validada não aparece na fila.
    expect(screen.queryByText("Carlos Neto")).toBeNull();
    // StatGrid: 1 pendente + 1 validada — os dois indicadores mostram "1".
    expect(screen.getAllByText("1").length).toBe(2);
  });

  it("mostra o estado vazio sem atalho quando o filtro já é 'Pendentes'", async () => {
    listHrAbsencesForReviewMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Nenhuma falta por rever")).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: "Ver faltas pendentes" })).toBeNull();
  });

  it("muda o título do estado vazio ao trocar de filtro e mostra o atalho de volta", async () => {
    // Só há uma falta validada — sob o filtro por omissão ("pending") a
    // lista já começa vazia; o teste troca para "rejected" e confirma que o
    // título do estado vazio muda de acordo.
    listHrAbsencesForReviewMock.mockResolvedValue([validatedAbsence]);

    const Page = await loadPage();
    renderRoute(Page);

    const select = await screen.findByLabelText("Filtrar faltas por estado");
    fireEvent.change(select, { target: { value: "rejected" } });

    await waitFor(() => {
      expect(screen.getByText("Nenhuma falta rejeitada")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Ver faltas pendentes" })).toBeDefined();
  });

  it("mostra o ramo de erro quando a API falha", async () => {
    listHrAbsencesForReviewMock.mockRejectedValue(new Error("Sem permissão para rever faltas."));

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Sem permissão para rever faltas.")).toBeDefined();
    });
  });

  it("valida uma falta pendente depois de preencher a justificação", async () => {
    listHrAbsencesForReviewMock.mockResolvedValue([pendingAbsence]);
    reviewHrAbsenceMock.mockResolvedValue({ ok: true });

    const Page = await loadPage();
    renderRoute(Page);

    const reasonInput = await screen.findByLabelText("Justificação da falta de Joana Mendes");
    const validateButton = screen.getByRole("button", { name: "Validar" });

    // Sem justificação (< 3 caracteres) o botão fica desactivado.
    expect(validateButton).toHaveProperty("disabled", true);

    fireEvent.change(reasonInput, { target: { value: "Confirmado com o funcionário" } });
    expect(validateButton).toHaveProperty("disabled", false);

    fireEvent.click(validateButton);

    await waitFor(() => {
      expect(reviewHrAbsenceMock).toHaveBeenCalledWith({
        data: {
          absenceId: "abs-1",
          absenceType: "unjustified",
          decision: "validate",
          reason: "Confirmado com o funcionário",
        },
      });
    });
  });

  it("não mostra controlos de decisão numa falta já validada", async () => {
    listHrAbsencesForReviewMock.mockResolvedValue([validatedAbsence]);

    const Page = await loadPage();
    renderRoute(Page);

    // Trocar o filtro para ver a falta validada.
    const select = await screen.findByLabelText("Filtrar faltas por estado");
    fireEvent.change(select, { target: { value: "validated" } });

    await waitFor(() => {
      expect(screen.getByText("Carlos Neto")).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rejeitar" })).toBeNull();
    // O campo de justificação continua visível, mas desactivado.
    const reasonInput = screen.getByLabelText(
      "Justificação da falta de Carlos Neto",
    ) as HTMLInputElement;
    expect(reasonInput.disabled).toBe(true);
  });
});
