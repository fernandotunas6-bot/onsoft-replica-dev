// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, clickTab } from "./_harness";
import type {
  getAlumniOverview,
  listAlumni,
  listAlumniEvents,
  listAlumniOpportunities,
} from "@/features/alumni/server";

/**
 * Testes de montagem e render de `/alumni` (directório principal).
 *
 * Valida:
 * 1. Transição de loading para carregado com os indicadores e o cartão de
 *    um Alumni real no directório.
 * 2. Estado vazio do directório quando o filtro não encontra ninguém.
 * 3. Sincronização de concluídos (`bootstrapGraduatedStudents`) invalida
 *    overview e directório ao suceder.
 * 4. Aba "Eventos" só mostra eventos publicados e futuros — um evento já
 *    passado não aparece, mesmo estando "published".
 * 5. Botão "Mentores" alterna o filtro e o texto do atalho no cabeçalho.
 */

type Overview = Awaited<ReturnType<typeof getAlumniOverview>>;
type AlumniRow = Awaited<ReturnType<typeof listAlumni>>[number];
type EventRow = Awaited<ReturnType<typeof listAlumniEvents>>[number];
type OpportunityRow = Awaited<ReturnType<typeof listAlumniOpportunities>>[number];

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());

const getAlumniOverviewMock = vi.fn();
const listAlumniMock = vi.fn();
const listAlumniOpportunitiesMock = vi.fn();
const listAlumniEventsMock = vi.fn();
const bootstrapGraduatedStudentsMock = vi.fn();

vi.mock("@/features/alumni/server", () => ({
  getAlumniOverview: () => getAlumniOverviewMock(),
  listAlumni: () => listAlumniMock(),
  listAlumniOpportunities: () => listAlumniOpportunitiesMock(),
  listAlumniEvents: () => listAlumniEventsMock(),
  bootstrapGraduatedStudents: () => bootstrapGraduatedStudentsMock(),
}));

const sampleOverview: Overview = {
  total: 48,
  employed: 30,
  mentors: 6,
  opportunities: 4,
  activeMentorships: 3,
  upcomingEvents: 1,
  verified: 20,
  openToOpportunities: 12,
  cohorts: 5,
  provinces: 3,
  averageCompletion: 72,
  aoaContributions: 500000,
  volunteerHours: 40,
  employmentRate: 62,
  verificationRate: 42,
};

const emptyOverview: Overview = {
  ...sampleOverview,
  total: 0,
  employed: 0,
  mentors: 0,
  opportunities: 0,
  activeMentorships: 0,
  upcomingEvents: 0,
  verified: 0,
  openToOpportunities: 0,
};

const sampleAlumni: AlumniRow = {
  id: "al-1",
  student_id: "stu-1",
  person_id: "per-1",
  graduation_year: 2020,
  graduation_grade: null,
  graduation_course: "Informática",
  headline: "Engenheira de Software",
  biography: null,
  current_company: "TechAO",
  current_role: "Engenheira de Software",
  employment_status: "employed",
  industry: "Tecnologia",
  city: "Luanda",
  province: "Luanda",
  country: "Angola",
  linkedin_url: null,
  website_url: null,
  skills: [],
  interests: [],
  available_for_mentoring: true,
  seeking_mentor: false,
  open_to_opportunities: true,
  directory_visibility: "school",
  contact_consent: true,
  verified_at: "2026-01-01T00:00:00Z",
  last_engagement_at: null,
  profile_completion: 85,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  student_number: "2015-0042",
  full_name: "Beatriz Ndongo",
  email: "beatriz@example.com",
  phone: null,
  photo_url: null,
};

const pastEvent: EventRow = {
  id: "ev-past",
  school_id: "sch-1",
  title: "Encontro 2020",
  description: null,
  event_type: "networking",
  location: "Luanda",
  online_url: null,
  starts_at: "2020-01-01T18:00:00Z",
  ends_at: "2020-01-01T20:00:00Z",
  capacity: null,
  status: "published",
  created_at: "2019-12-01T00:00:00Z",
  updated_at: "2019-12-01T00:00:00Z",
} as EventRow;

const futureEvent: EventRow = {
  ...pastEvent,
  id: "ev-future",
  title: "Encontro Anual 2027",
  starts_at: "2027-06-01T18:00:00Z",
  ends_at: "2027-06-01T20:00:00Z",
} as EventRow;

const sampleOpportunity: OpportunityRow = {
  id: "opp-1",
  school_id: "sch-1",
  created_by_alumni_id: "al-1",
  title: "Vaga de Engenharia",
  organization: "TechAO",
  opportunity_type: "job",
  description: null,
  location: "Luanda",
  remote_allowed: true,
  application_url: null,
  starts_at: null,
  expires_at: null,
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as OpportunityRow;

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni", () => {
  it("mostra loading e depois os indicadores e o cartão de um Alumni real", async () => {
    getAlumniOverviewMock.mockResolvedValue(sampleOverview);
    listAlumniMock.mockResolvedValue([sampleAlumni]);
    listAlumniOpportunitiesMock.mockResolvedValue([]);
    listAlumniEventsMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar a rede Alumni/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    });
    expect(screen.getByText("48")).toBeDefined();
    expect(screen.getByText("62%")).toBeDefined();
  });

  it("mostra o estado vazio do directório quando o filtro não encontra ninguém", async () => {
    getAlumniOverviewMock.mockResolvedValue(emptyOverview);
    listAlumniMock.mockResolvedValue([]);
    listAlumniOpportunitiesMock.mockResolvedValue([]);
    listAlumniEventsMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não há Alumni neste filtro")).toBeDefined();
    });
  });

  it("sincronizar concluídos invalida o overview e o directório ao suceder", async () => {
    getAlumniOverviewMock.mockResolvedValue(sampleOverview);
    listAlumniMock.mockResolvedValue([sampleAlumni]);
    listAlumniOpportunitiesMock.mockResolvedValue([]);
    listAlumniEventsMock.mockResolvedValue([]);
    bootstrapGraduatedStudentsMock.mockResolvedValue({ created: 3 });

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar concluídos/ }));

    await waitFor(() => {
      expect(bootstrapGraduatedStudentsMock).toHaveBeenCalled();
    });
    // Após o sucesso, a query de overview/directório é invalidada e
    // reexecutada — confirmamos que o mock foi chamado mais que uma vez.
    await waitFor(() => {
      expect(listAlumniMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("aba 'Eventos' só mostra eventos publicados e futuros", async () => {
    getAlumniOverviewMock.mockResolvedValue(sampleOverview);
    listAlumniMock.mockResolvedValue([sampleAlumni]);
    listAlumniOpportunitiesMock.mockResolvedValue([]);
    listAlumniEventsMock.mockResolvedValue([pastEvent, futureEvent]);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    clickTab(screen.getByRole("tab", { name: "Eventos" }));

    await waitFor(() => {
      expect(screen.getByText("Encontro Anual 2027")).toBeDefined();
    });
    expect(screen.queryByText("Encontro 2020")).toBeNull();
  });

  it("o botão 'Mentores' alterna o filtro e o texto do atalho no cabeçalho", async () => {
    getAlumniOverviewMock.mockResolvedValue(sampleOverview);
    listAlumniMock.mockResolvedValue([sampleAlumni]);
    listAlumniOpportunitiesMock.mockResolvedValue([sampleOpportunity]);
    listAlumniEventsMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    const headerShortcut = screen.getByRole("button", { name: /Encontrar mentores/ });
    fireEvent.click(headerShortcut);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Ver toda a rede/ })).toBeDefined();
    });
  });
});
