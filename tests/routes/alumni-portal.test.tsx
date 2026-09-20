// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, clickTab } from "./_harness";

/**
 * Testes de montagem e render de `/alumni/portal`.
 *
 * Apesar do nome "portal", esta é uma rota interna comum — vive dentro do
 * `AppShell` como qualquer outra do SIGA, não um portal externo com
 * autenticação diferente; é o painel de self-service do próprio Alumni
 * autenticado (papel Alumni), não uma vista administrativa. Mesmo padrão
 * de mock das restantes rotas Alumni.
 *
 * A aba "Privacidade" monta `AlumniPrivacyPanel`, que tem as suas próprias
 * duas queries (`getMyAlumniPrivacy`, `listMyAlumniPrivacyAudit`) — por
 * isso o módulo `@/features/alumni/privacy` também precisa de mock, mesmo
 * só para montar a rota em segurança se algum teste abrir essa aba.
 *
 * Valida:
 * 1. Perfil ainda não activado (`getMyAlumniPortal` falha) mostra o ecrã
 *    de activação, não o loading nem um erro genérico.
 * 2. `claimMyAlumniProfile` ao suceder invalida a query do portal.
 * 3. Perfil activado: loading → indicadores carregados.
 * 4. Aba "Oportunidades": uma candidatura já "applied" mostra "Candidatei-me"
 *    destacado e o botão "Retirar"; uma sem candidatura não mostra "Retirar".
 * 5. Aba "Eventos": um evento já inscrito mostra "Inscrito" desactivado,
 *    em vez de "Inscrever-me".
 */

const getMyAlumniPortalMock = vi.fn();
const claimMyAlumniProfileMock = vi.fn();
const updateMyAlumniProfileMock = vi.fn();
const saveMyOpportunityInterestMock = vi.fn();
const registerMyAlumniEventMock = vi.fn();

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());

vi.mock("@/features/alumni/self-service", () => ({
  getMyAlumniPortal: () => getMyAlumniPortalMock(),
  claimMyAlumniProfile: () => claimMyAlumniProfileMock(),
  updateMyAlumniProfile: (input: unknown) => updateMyAlumniProfileMock(input),
  saveMyOpportunityInterest: (input: unknown) => saveMyOpportunityInterestMock(input),
  registerMyAlumniEvent: (input: unknown) => registerMyAlumniEventMock(input),
  submitMyAlumniSurvey: vi.fn(),
}));

vi.mock("@/features/alumni/privacy", () => ({
  getMyAlumniPrivacy: vi.fn().mockResolvedValue(null),
  listMyAlumniPrivacyAudit: vi.fn().mockResolvedValue([]),
  updateMyAlumniPrivacy: vi.fn(),
}));

function buildPortal() {
  return {
    profile: { id: "al-1", profile_completion: 40, headline: null, current_role: null },
    person: { full_name: "Beatriz Ndongo", photo_url: null },
    experiences: [],
    applications: [{ opportunity_id: "opp-1", status: "applied" }],
    opportunities: [
      {
        id: "opp-1",
        title: "Vaga de Engenharia",
        organization: "TechAO",
        opportunity_type: "job",
        remote_allowed: false,
        description: null,
      },
    ],
    events: [
      {
        id: "ev-1",
        title: "Encontro Anual",
        event_type: "networking",
        starts_at: "2027-06-01T18:00:00Z",
        location: "Luanda",
      },
    ],
    registrations: [{ event_id: "ev-1", status: "confirmed" }],
    surveys: [],
    mentorships: [],
  };
}

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.portal");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/portal", () => {
  it("perfil ainda não activado mostra o ecrã de activação, não um erro genérico", async () => {
    getMyAlumniPortalMock.mockRejectedValue(new Error("Perfil Alumni não encontrado."));

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Activar o meu Portal Alumni")).toBeDefined();
    });
    expect(screen.getByText("Perfil Alumni não encontrado.")).toBeDefined();
  });

  it("clicar em 'Validar e activar' chama claimMyAlumniProfile e invalida o portal", async () => {
    getMyAlumniPortalMock.mockRejectedValue(new Error("Perfil Alumni não encontrado."));
    claimMyAlumniProfileMock.mockResolvedValue({ ok: true });

    const Page = await loadPage();
    renderRoute(Page);

    const claimButton = await screen.findByRole("button", { name: /Validar e activar/ });
    fireEvent.click(claimButton);

    await waitFor(() => {
      expect(claimMyAlumniProfileMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(getMyAlumniPortalMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("perfil activado: loading e depois os indicadores carregados", async () => {
    getMyAlumniPortalMock.mockResolvedValue(buildPortal());

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A preparar o seu Portal Alumni/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    });
    expect(screen.getByText("40%")).toBeDefined();
  });

  it("aba 'Oportunidades': candidatura já 'applied' mostra o botão de retirar", async () => {
    getMyAlumniPortalMock.mockResolvedValue(buildPortal());

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    clickTab(screen.getByRole("tab", { name: "Oportunidades" }));

    await waitFor(() => {
      expect(screen.getByText("Vaga de Engenharia")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Retirar" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    await waitFor(() => {
      expect(saveMyOpportunityInterestMock).toHaveBeenCalledWith({
        data: { opportunityId: "opp-1", status: "withdrawn" },
      });
    });
  });

  it("aba 'Eventos': um evento já inscrito mostra 'Inscrito' desactivado", async () => {
    getMyAlumniPortalMock.mockResolvedValue(buildPortal());

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    clickTab(screen.getByRole("tab", { name: "Eventos" }));

    const registeredButton = await screen.findByRole("button", { name: "Inscrito" });
    expect(registeredButton).toHaveProperty("disabled", true);
    expect(registerMyAlumniEventMock).not.toHaveBeenCalled();
  });
});
