// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, clickTab } from "./_harness";

/**
 * Testes de montagem e render de `/alumni/pipeline`.
 *
 * Valida:
 * 1. Transição de loading para carregado com os três contadores e uma
 *    candidatura real listada.
 * 2. Estados vazios das três abas.
 * 3. Mudar o estado de uma candidatura no `<select>` chama
 *    `updateOpportunityApplicationStatus` com `opportunityId`/`alumniId`
 *    da linha, não valores soltos.
 * 4. Formulário de nova mentoria: o `<select>` de mentorado exclui o
 *    mentor já seleccionado (não faz sentido ser mentor de si próprio), e
 *    "Criar mentoria" só desbloqueia com mentor + mentorado + foco (2+
 *    caracteres).
 */

const listOpportunityApplicationPipelineMock = vi.fn();
const listEventRegistrationPipelineMock = vi.fn();
const listMentorshipPipelineMock = vi.fn();
const listAlumniMock = vi.fn();
const updateOpportunityApplicationStatusMock = vi.fn();
const updateEventRegistrationStatusMock = vi.fn();
const updateMentorshipPipelineStatusMock = vi.fn();
const createMentorshipFromPipelineMock = vi.fn();

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

vi.mock("@/features/alumni/server", () => ({
  listAlumni: () => listAlumniMock(),
}));

vi.mock("@/features/alumni/pipeline", () => ({
  listOpportunityApplicationPipeline: (input: unknown) =>
    listOpportunityApplicationPipelineMock(input),
  listEventRegistrationPipeline: (input: unknown) => listEventRegistrationPipelineMock(input),
  listMentorshipPipeline: (input: unknown) => listMentorshipPipelineMock(input),
  updateOpportunityApplicationStatus: (input: unknown) =>
    updateOpportunityApplicationStatusMock(input),
  updateEventRegistrationStatus: (input: unknown) => updateEventRegistrationStatusMock(input),
  updateMentorshipPipelineStatus: (input: unknown) => updateMentorshipPipelineStatusMock(input),
  createMentorshipFromPipeline: (input: unknown) => createMentorshipFromPipelineMock(input),
}));

const sampleApplication = {
  id: "app-1",
  opportunity_id: "opp-1",
  alumni_id: "al-1",
  status: "applied",
  applied_at: "2026-01-01T00:00:00Z",
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  alumni_opportunities: { title: "Vaga de Engenharia", organization: "TechAO" },
  alumni: { fullName: "Beatriz Ndongo", studentNumber: "2015-0042" },
};

const mentorAlumni = {
  id: "al-mentor",
  full_name: "Carlos Neto",
  student_number: "2010-0010",
  available_for_mentoring: true,
};

const menteeAlumni = {
  id: "al-mentee",
  full_name: "Sara Ferreira",
  student_number: "2019-0055",
  available_for_mentoring: false,
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.pipeline");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/pipeline", () => {
  it("mostra os três contadores e uma candidatura real depois de carregar", async () => {
    listOpportunityApplicationPipelineMock.mockResolvedValue([sampleApplication]);
    listEventRegistrationPipelineMock.mockResolvedValue([]);
    listMentorshipPipelineMock.mockResolvedValue([]);
    listAlumniMock.mockResolvedValue([mentorAlumni, menteeAlumni]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    });
    expect(screen.getByText("Vaga de Engenharia")).toBeDefined();
    // Contadores: 1 candidatura, 0 inscrições, 0 mentorias.
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getAllByText("0").length).toBe(2);
  });

  it("mostra os estados vazios das três abas", async () => {
    listOpportunityApplicationPipelineMock.mockResolvedValue([]);
    listEventRegistrationPipelineMock.mockResolvedValue([]);
    listMentorshipPipelineMock.mockResolvedValue([]);
    listAlumniMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Sem candidaturas registadas nesta selecção.")).toBeDefined();
    });

    clickTab(screen.getByRole("tab", { name: "Eventos & Presenças" }));
    await waitFor(() => {
      expect(screen.getByText("Ainda não existem inscrições em eventos.")).toBeDefined();
    });

    clickTab(screen.getByRole("tab", { name: "Mentorias" }));
    await waitFor(() => {
      expect(screen.getByText("Ainda não existem mentorias registadas.")).toBeDefined();
    });
  });

  it("mudar o estado de uma candidatura chama updateOpportunityApplicationStatus com os IDs da linha", async () => {
    listOpportunityApplicationPipelineMock.mockResolvedValue([sampleApplication]);
    listEventRegistrationPipelineMock.mockResolvedValue([]);
    listMentorshipPipelineMock.mockResolvedValue([]);
    listAlumniMock.mockResolvedValue([]);
    updateOpportunityApplicationStatusMock.mockResolvedValue({ ok: true });

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    const select = screen.getByDisplayValue("Candidatou-se");
    fireEvent.change(select, { target: { value: "shortlisted" } });

    await waitFor(() => {
      expect(updateOpportunityApplicationStatusMock).toHaveBeenCalledWith({
        data: { opportunityId: "opp-1", alumniId: "al-1", status: "shortlisted" },
      });
    });
  });

  it("o mentorado exclui o mentor seleccionado, e 'Criar mentoria' só desbloqueia com os três campos", async () => {
    listOpportunityApplicationPipelineMock.mockResolvedValue([]);
    listEventRegistrationPipelineMock.mockResolvedValue([]);
    listMentorshipPipelineMock.mockResolvedValue([]);
    listAlumniMock.mockResolvedValue([mentorAlumni, menteeAlumni]);

    const Page = await loadPage();
    renderRoute(Page);

    clickTab(await screen.findByRole("tab", { name: "Mentorias" }));

    const mentorSelect = await screen.findByDisplayValue("Seleccionar mentor…");
    const createButton = screen.getByRole("button", { name: /Criar mentoria/ });
    expect(createButton).toHaveProperty("disabled", true);

    fireEvent.change(mentorSelect, { target: { value: "al-mentor" } });

    // O mentor seleccionado desaparece das opções de mentorado.
    const menteeSelect = screen.getByDisplayValue("Seleccionar mentorado…");
    expect(within(menteeSelect).queryByText("Carlos Neto · 2010-0010")).toBeNull();
    expect(within(menteeSelect).getByText("Sara Ferreira · 2019-0055")).toBeDefined();

    fireEvent.change(menteeSelect, { target: { value: "al-mentee" } });
    expect(createButton).toHaveProperty("disabled", true); // falta a área de foco

    const focusInput = screen.getByPlaceholderText(/Área de foco/);
    fireEvent.change(focusInput, { target: { value: "Carreira" } });
    expect(createButton).toHaveProperty("disabled", false);
  });
});
