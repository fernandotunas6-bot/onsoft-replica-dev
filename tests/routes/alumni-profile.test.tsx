// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  routeComponentOf,
  setRouteParams,
  resetRouteLocation,
  clickTab,
} from "./_harness";

/**
 * Testes de montagem e render de `/alumni/$alumniId` (ficha 360º).
 *
 * Valida:
 * 1. Transição de loading para carregado com os dados de identidade.
 * 2. Ramo de erro (`isError` ou dados ausentes) — mesma mensagem para os
 *    dois casos, o componente não distingue "não encontrado" de "falhou".
 * 3. Perfil não verificado mostra "Verificar identidade"; clicar chama
 *    `verifyAlumniProfile` e invalida a query do perfil ao suceder.
 * 4. Perfil já verificado mostra o crachá em vez do botão.
 * 5. Aba "Académico" mostra as matrículas preservadas do registo original.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());

const getAlumniProfileMock = vi.fn();
const verifyAlumniProfileMock = vi.fn();

vi.mock("@/features/alumni/server", () => ({
  getAlumniProfile: (input: unknown) => getAlumniProfileMock(input),
  verifyAlumniProfile: (input: unknown) => verifyAlumniProfileMock(input),
}));

function buildProfileData(overrides: { verified_at?: string | null } = {}) {
  return {
    profile: {
      id: "al-1",
      verified_at: overrides.verified_at ?? null,
      headline: "Engenheira de Software",
      current_role: "Engenheira de Software",
      current_company: "TechAO",
      graduation_year: 2020,
      profile_completion: 80,
      employment_status: "employed",
      industry: "Tecnologia",
      graduation_course: "Informática",
      directory_visibility: "school",
      available_for_mentoring: true,
      seeking_mentor: false,
      open_to_opportunities: true,
      city: "Luanda",
      province: "Luanda",
      country: "Angola",
    },
    person: {
      full_name: "Beatriz Ndongo",
      email: "beatriz@example.com",
      phone: "+244 923 000 000",
      photo_url: null,
    },
    student: { student_number: "2015-0042" },
    enrollments: [{ id: "enr-1234abcd", status: "concluded" }],
    experiences: [],
    engagements: [],
    mentorships: [],
    applications: [],
    eventRegistrations: [],
  };
}

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.$alumniId");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
});

describe("/alumni/$alumniId", () => {
  it("mostra loading e depois os dados de identidade carregados", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockResolvedValue(buildProfileData());

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar ficha Alumni 360º/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    });
    expect(getAlumniProfileMock).toHaveBeenCalledWith({ data: { alumniId: "al-1" } });
    expect(screen.getByText("beatriz@example.com")).toBeDefined();
  });

  it("mostra o ramo de erro quando a query falha", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockRejectedValue(new Error("boom"));

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Não foi possível carregar este Alumni.")).toBeDefined();
    });
  });

  it("perfil não verificado: clicar em 'Verificar identidade' chama verifyAlumniProfile e invalida a query", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockResolvedValue(buildProfileData({ verified_at: null }));
    verifyAlumniProfileMock.mockResolvedValue({ ok: true });

    const Page = await loadPage();
    renderRoute(Page);

    const verifyButton = await screen.findByRole("button", { name: /Verificar identidade/ });
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(verifyAlumniProfileMock).toHaveBeenCalledWith({ data: { alumniId: "al-1" } });
    });
    // Sucesso invalida a query do perfil — chamado mais que uma vez.
    await waitFor(() => {
      expect(getAlumniProfileMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("perfil já verificado mostra o crachá em vez do botão de verificação", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockResolvedValue(
      buildProfileData({ verified_at: "2026-01-01T00:00:00Z" }),
    );

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Identidade verificada")).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: /Verificar identidade/ })).toBeNull();
  });

  it("aba 'Académico' mostra as matrículas preservadas do registo original", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockResolvedValue(buildProfileData());

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    clickTab(screen.getByRole("tab", { name: "Académico" }));

    await waitFor(() => {
      expect(screen.getByText("Matrícula enr-1234")).toBeDefined();
    });
    expect(screen.getByText("concluded")).toBeDefined();
  });
});
