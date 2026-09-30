// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { buildSetupGuide, type SetupCounts } from "@/features/school/setup-guide";

const state = vi.hoisted(() => ({ guide: null as unknown }));
const openSettingsPanel = vi.hoisted(() => vi.fn());

vi.mock("@/features/school/setup-guide-server", () => ({
  getSchoolSetupGuide: () => Promise.resolve(state.guide),
}));
vi.mock("@/lib/settings-deep-link", () => ({ openSettingsPanel }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...(rest as object)}>
      {children}
    </a>
  ),
}));

const NOVA: SetupCounts = {
  school: { nif: true, director: false, contact: true, logo: false },
  activeYear: null,
  termsInActiveYear: 0,
  programs: 0,
  gradeLevels: 0,
  subjects: 0,
  classGroupsInActiveYear: 0,
  rooms: 0,
  assessmentModel: false,
  activeFeePlanWithItems: false,
  otherMembers: 0,
  pendingInvitations: 0,
  students: 0,
  publicEnrollmentOpen: false,
};

function renderGuide(counts: SetupCounts) {
  state.guide = {
    ...buildSetupGuide(counts),
    schoolName: "Colégio Teste",
    subscription: { planName: "Professional", status: "trialing", trialEndsAt: "2026-10-14" },
  };
  return import("@/features/school/SchoolSetupGuide").then(({ SchoolSetupGuide }) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SchoolSetupGuide />
      </QueryClientProvider>,
    ),
  );
}

describe("guia de arranque no painel", () => {
  beforeEach(() => {
    localStorage.clear();
    openSettingsPanel.mockClear();
  });
  afterEach(cleanup);

  it("escola nova: destaca o primeiro passo e mostra o plano experimental", async () => {
    await renderGuide(NOVA);
    expect(await screen.findByText("Arranque da escola")).toBeTruthy();
    expect(screen.getByText("Próximo passo")).toBeTruthy();
    expect(screen.getAllByText("Confirmar os dados da escola").length).toBeGreaterThan(0);
    expect(screen.getByText(/Plano Professional · experimental até 14\/10\/2026/)).toBeTruthy();
    // Passo bloqueado diz o que tem de vir antes.
    expect(
      screen.getByText("Primeiro: Criar as turmas do ano e Definir propina e matrícula."),
    ).toBeTruthy();
  });

  it("o botão do próximo passo abre o painel de definições certo", async () => {
    await renderGuide(NOVA);
    fireEvent.click(await screen.findByRole("button", { name: /Abrir dados da escola/ }));
    expect(openSettingsPanel).toHaveBeenCalledWith("escola");
  });

  it("passos de rota levam ao ecrã com o separador certo", async () => {
    await renderGuide({ ...NOVA, school: { ...NOVA.school, director: true } });
    const link = await screen.findByRole("link", { name: /Abrir calendário/ });
    expect(link.getAttribute("href")).toBe("/calendario");
  });

  it("escola pronta: mensagem curta que se pode ocultar", async () => {
    await renderGuide({
      school: { nif: true, director: true, contact: true, logo: true },
      activeYear: { name: "2026/2027" },
      termsInActiveYear: 3,
      programs: 1,
      gradeLevels: 6,
      subjects: 10,
      classGroupsInActiveYear: 4,
      rooms: 2,
      assessmentModel: true,
      activeFeePlanWithItems: true,
      otherMembers: 2,
      pendingInvitations: 0,
      students: 40,
      publicEnrollmentOpen: false,
    });
    expect(await screen.findByText("A escola está pronta a operar.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(screen.queryByText("A escola está pronta a operar.")).toBeNull();
  });
});
