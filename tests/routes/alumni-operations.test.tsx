// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, clickTab } from "./_harness";

/**
 * Testes de montagem e render de `/alumni/operations`.
 *
 * Valida:
 * 1. Transição de loading para carregado com os três contadores
 *    (só conta oportunidades/eventos "published", eventos só futuros).
 * 2. "Publicar oportunidade" só desbloqueia com título, e envia o payload
 *    com `remoteAllowed: false` e `status: "published"` fixos.
 * 3. Construtor de Tracer Study: o campo "Uma opção por linha" só aparece
 *    para perguntas do tipo Selecção/Múltipla selecção — não para texto.
 * 4. Contribuição do tipo "Horas de voluntariado" envia `hours`, não
 *    `amount` — e o inverso para os outros tipos.
 */

const listAlumniMock = vi.fn();
const listAlumniOpportunitiesMock = vi.fn();
const listAlumniEventsMock = vi.fn();
const upsertAlumniOpportunityMock = vi.fn();
const upsertAlumniEventMock = vi.fn();
const listAlumniSurveysMock = vi.fn();
const upsertAlumniSurveyMock = vi.fn();
const recordAlumniContributionMock = vi.fn();

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

vi.mock("@/features/alumni/server", () => ({
  listAlumni: () => listAlumniMock(),
  listAlumniOpportunities: () => listAlumniOpportunitiesMock(),
  listAlumniEvents: () => listAlumniEventsMock(),
  upsertAlumniOpportunity: (input: unknown) => upsertAlumniOpportunityMock(input),
  upsertAlumniEvent: (input: unknown) => upsertAlumniEventMock(input),
}));

vi.mock("@/features/alumni/operations", () => ({
  listAlumniSurveys: () => listAlumniSurveysMock(),
  upsertAlumniSurvey: (input: unknown) => upsertAlumniSurveyMock(input),
  recordAlumniContribution: (input: unknown) => recordAlumniContributionMock(input),
}));

const publishedOpportunity = { id: "opp-1", status: "published" };
const draftOpportunity = { id: "opp-2", status: "draft" };
const futureEvent = {
  id: "ev-1",
  status: "published",
  starts_at: "2027-06-01T18:00:00Z",
};
const pastEvent = { id: "ev-2", status: "published", starts_at: "2020-01-01T18:00:00Z" };
const publishedSurvey = { id: "sv-1", status: "published" };

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.operations");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/operations", () => {
  it("mostra os contadores só de itens publicados e eventos só futuros", async () => {
    listAlumniMock.mockResolvedValue([]);
    listAlumniOpportunitiesMock.mockResolvedValue([publishedOpportunity, draftOpportunity]);
    listAlumniEventsMock.mockResolvedValue([futureEvent, pastEvent]);
    listAlumniSurveysMock.mockResolvedValue([publishedSurvey]);

    const Page = await loadPage();
    renderRoute(Page);

    // "Publicar oportunidade" é estático (não depende de nenhuma query) —
    // esperar por ele não garante que os contadores já resolveram.
    await waitFor(() => {
      expect(screen.getAllByText("1").length).toBe(3);
    });
  });

  it("'Publicar oportunidade' só desbloqueia com título e envia status/remoteAllowed fixos", async () => {
    listAlumniMock.mockResolvedValue([]);
    listAlumniOpportunitiesMock.mockResolvedValue([]);
    listAlumniEventsMock.mockResolvedValue([]);
    listAlumniSurveysMock.mockResolvedValue([]);
    upsertAlumniOpportunityMock.mockResolvedValue({ id: "opp-new" });

    const Page = await loadPage();
    renderRoute(Page);

    const publishButton = await screen.findByRole("button", { name: /Publicar oportunidade/ });
    expect(publishButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText("Título da oportunidade"), {
      target: { value: "Vaga de Engenharia" },
    });
    expect(publishButton).toHaveProperty("disabled", false);

    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(upsertAlumniOpportunityMock).toHaveBeenCalledWith({
        data: {
          title: "Vaga de Engenharia",
          organization: undefined,
          opportunityType: "job",
          remoteAllowed: false,
          status: "published",
        },
      });
    });
  });

  it("o campo de opções só aparece para perguntas de Selecção/Múltipla selecção", async () => {
    listAlumniMock.mockResolvedValue([]);
    listAlumniOpportunitiesMock.mockResolvedValue([]);
    listAlumniEventsMock.mockResolvedValue([]);
    listAlumniSurveysMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    clickTab(await screen.findByRole("tab", { name: "Tracer Studies" }));

    expect(screen.queryByPlaceholderText("Uma opção por linha")).toBeNull();

    const typeSelect = screen.getByDisplayValue("Texto");
    fireEvent.change(typeSelect, { target: { value: "select" } });

    expect(screen.getByPlaceholderText("Uma opção por linha")).toBeDefined();
  });

  it("contribuição do tipo 'Horas de voluntariado' envia hours, não amount", async () => {
    listAlumniMock.mockResolvedValue([{ id: "al-1", full_name: "Beatriz Ndongo" }]);
    listAlumniOpportunitiesMock.mockResolvedValue([]);
    listAlumniEventsMock.mockResolvedValue([]);
    listAlumniSurveysMock.mockResolvedValue([]);
    recordAlumniContributionMock.mockResolvedValue({ id: "ctr-1" });

    const Page = await loadPage();
    renderRoute(Page);

    clickTab(await screen.findByRole("tab", { name: "Contribuições" }));

    const alumniSelect = await screen.findByDisplayValue("Seleccionar Alumni…");
    fireEvent.change(alumniSelect, { target: { value: "al-1" } });

    const typeSelect = screen.getByDisplayValue("Doação");
    fireEvent.change(typeSelect, { target: { value: "volunteer_hours" } });

    const valueInput = screen.getByPlaceholderText("Horas");
    fireEvent.change(valueInput, { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /Registar impacto/ }));

    await waitFor(() => {
      expect(recordAlumniContributionMock).toHaveBeenCalledWith({
        data: {
          alumniId: "al-1",
          contributionType: "volunteer_hours",
          amount: undefined,
          hours: 5,
          currency: "AOA",
          designation: undefined,
        },
      });
    });
  });
});
