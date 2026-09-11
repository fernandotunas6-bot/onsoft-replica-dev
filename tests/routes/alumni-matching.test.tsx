// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { listAlumni } from "@/features/alumni/server";
import type { getAlumniMentorRecommendations } from "@/features/alumni/recommendations";

/**
 * Testes de montagem e render de `/alumni/matching`.
 *
 * Valida:
 * 1. Sem Alumni seleccionado: mensagem de convite, `getAlumniMentorRecommendations`
 *    nunca é chamado (`enabled: Boolean(alumniId)` no route).
 * 2. Seleccionar um Alumni dispara a consulta de recomendações e mostra os
 *    motivos do score.
 * 3. Estado vazio quando não há mentores compatíveis suficientes.
 */

type AlumniRow = Awaited<ReturnType<typeof listAlumni>>[number];
type Match = Awaited<ReturnType<typeof getAlumniMentorRecommendations>>[number];

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listAlumniMock = vi.fn();
const getAlumniMentorRecommendationsMock = vi.fn();

vi.mock("@/features/alumni/server", () => ({
  listAlumni: () => listAlumniMock(),
}));

vi.mock("@/features/alumni/recommendations", () => ({
  getAlumniMentorRecommendations: (input: unknown) => getAlumniMentorRecommendationsMock(input),
}));

const seekerAlumni = {
  id: "al-seeker",
  full_name: "Nelson Costa",
  student_number: "2016-0021",
  graduation_year: 2019,
} as AlumniRow;

const mentorMatch: Match = {
  alumniId: "al-mentor",
  fullName: "Beatriz Ndongo",
  photoUrl: null,
  currentRole: "Engenheira de Software",
  currentCompany: "TechAO",
  headline: null,
  graduationYear: 2015,
  industry: "Tecnologia",
  province: "Luanda",
  city: "Luanda",
  verifiedAt: "2026-01-01T00:00:00Z",
  score: 87,
  reasons: ["Mesma área", "Mesma localização"],
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.matching");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/matching", () => {
  it("sem Alumni seleccionado, mostra o convite e nunca chama as recomendações", async () => {
    listAlumniMock.mockResolvedValue([seekerAlumni]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Seleccione um Alumni para calcular recomendações.")).toBeDefined();
    });
    expect(getAlumniMentorRecommendationsMock).not.toHaveBeenCalled();
  });

  it("seleccionar um Alumni dispara a consulta e mostra os motivos do score", async () => {
    listAlumniMock.mockResolvedValue([seekerAlumni]);
    getAlumniMentorRecommendationsMock.mockResolvedValue([mentorMatch]);

    const Page = await loadPage();
    renderRoute(Page);

    // Esperar a opção real antes de mudar o valor — o <select> monta antes
    // de `listAlumni` resolver, e `fireEvent.change` para um valor sem
    // `<option>` correspondente é ignorado em silêncio pelo jsdom.
    await screen.findByRole("option", { name: /Nelson Costa/ });
    const select = screen.getByDisplayValue("Escolha quem procura mentor…");
    fireEvent.change(select, { target: { value: "al-seeker" } });

    await waitFor(() => {
      expect(getAlumniMentorRecommendationsMock).toHaveBeenCalledWith({
        data: { alumniId: "al-seeker", limit: 12 },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    });
    expect(screen.getByText("87%")).toBeDefined();
    expect(screen.getByText("Mesma área")).toBeDefined();
  });

  it("mostra o estado vazio quando não há mentores compatíveis suficientes", async () => {
    listAlumniMock.mockResolvedValue([seekerAlumni]);
    getAlumniMentorRecommendationsMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    // Esperar a opção real antes de mudar o valor — o <select> monta antes
    // de `listAlumni` resolver, e `fireEvent.change` para um valor sem
    // `<option>` correspondente é ignorado em silêncio pelo jsdom.
    await screen.findByRole("option", { name: /Nelson Costa/ });
    const select = screen.getByDisplayValue("Escolha quem procura mentor…");
    fireEvent.change(select, { target: { value: "al-seeker" } });

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem mentores compatíveis suficientes.")).toBeDefined();
    });
  });
});
