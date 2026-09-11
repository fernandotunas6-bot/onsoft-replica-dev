// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { buildAlumniCommunicationAudience } from "@/features/alumni/admin-tools";

/**
 * Testes de montagem e render de `/alumni/communications`.
 *
 * Valida:
 * 1. Transição de loading para carregado com os três contadores.
 * 2. Trocar o canal para "E-mail" filtra do preview quem não tem e-mail
 *    autorizado — a contagem "Pré-validação" reflecte o filtro, os
 *    contadores do topo (que contam a audiência bruta) não mudam.
 * 3. Sem destinatário elegível para a combinação finalidade/canal, mostra
 *    o aviso em vez de uma lista vazia silenciosa.
 * 4. "Guardar rascunho" só desbloqueia com título e mensagem preenchidos,
 *    e envia a audiência já mapeada para a finalidade seleccionada.
 * 5. Mudar a finalidade dispara uma nova consulta da audiência.
 */

type AudienceRow = Awaited<ReturnType<typeof buildAlumniCommunicationAudience>>[number];

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const buildAlumniCommunicationAudienceMock = vi.fn();
const createSchoolAnnouncementMock = vi.fn();

vi.mock("@/features/alumni/admin-tools", () => ({
  buildAlumniCommunicationAudience: (input: unknown) => buildAlumniCommunicationAudienceMock(input),
}));

vi.mock("@/features/communications/server", () => ({
  createSchoolAnnouncement: (input: unknown) => createSchoolAnnouncementMock(input),
}));

const withEmail: AudienceRow = {
  alumniId: "al-1",
  fullName: "Beatriz Ndongo",
  email: "beatriz@example.com",
  phone: null,
  graduationYear: 2020,
  province: "Luanda",
};

const withoutEmail: AudienceRow = {
  alumniId: "al-2",
  fullName: "Carlos Neto",
  email: null,
  phone: "+244923000000",
  graduationYear: 2018,
  province: "Benguela",
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.communications");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/communications", () => {
  it("mostra os três contadores depois de carregar a audiência", async () => {
    buildAlumniCommunicationAudienceMock.mockResolvedValue([withEmail, withoutEmail]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    });
    // 2 consentidos, 1 com e-mail, 1 com telefone.
    expect(screen.getAllByText("1").length).toBe(2);
    expect(screen.getByText("2")).toBeDefined();
  });

  it("trocar para o canal 'E-mail' remove do preview quem não tem e-mail", async () => {
    buildAlumniCommunicationAudienceMock.mockResolvedValue([withEmail, withoutEmail]);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    expect(screen.getByText("Carlos Neto")).toBeDefined();

    const channelSelect = screen.getByDisplayValue("Portal");
    fireEvent.change(channelSelect, { target: { value: "email" } });

    await waitFor(() => {
      expect(screen.queryByText("Carlos Neto")).toBeNull();
    });
    expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    expect(screen.getByText(/1 destinatário/)).toBeDefined();
  });

  it("mostra o aviso quando não há destinatário elegível para a combinação", async () => {
    buildAlumniCommunicationAudienceMock.mockResolvedValue([withoutEmail]);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Carlos Neto");
    const channelSelect = screen.getByDisplayValue("Portal");
    fireEvent.change(channelSelect, { target: { value: "email" } });

    await waitFor(() => {
      expect(
        screen.getByText("Nenhum Alumni elegível para esta combinação de finalidade e canal."),
      ).toBeDefined();
    });
  });

  it("'Guardar rascunho' só desbloqueia com título e mensagem, e envia a audiência mapeada", async () => {
    buildAlumniCommunicationAudienceMock.mockResolvedValue([withEmail]);
    createSchoolAnnouncementMock.mockResolvedValue({ id: "ann-1" });

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    const draftButton = screen.getByRole("button", { name: "Guardar rascunho" });
    expect(draftButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText("Título do comunicado"), {
      target: { value: "Encontro anual" },
    });
    expect(draftButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText(/Mensagem para a rede Alumni/), {
      target: { value: "Junte-se a nós em Junho." },
    });
    expect(draftButton).toHaveProperty("disabled", false);

    fireEvent.click(draftButton);

    await waitFor(() => {
      expect(createSchoolAnnouncementMock).toHaveBeenCalledWith({
        data: {
          title: "Encontro anual",
          body: "Junte-se a nós em Junho.",
          audience: "alumni_all",
          channel: "portal",
          status: "draft",
        },
      });
    });
  });

  it("mudar a finalidade dispara uma nova consulta da audiência", async () => {
    buildAlumniCommunicationAudienceMock.mockResolvedValue([withEmail]);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Beatriz Ndongo");
    expect(buildAlumniCommunicationAudienceMock).toHaveBeenCalledWith({
      data: { purpose: "general" },
    });

    const purposeSelect = screen.getByDisplayValue("Rede Alumni geral");
    fireEvent.change(purposeSelect, { target: { value: "mentoring" } });

    await waitFor(() => {
      expect(buildAlumniCommunicationAudienceMock).toHaveBeenCalledWith({
        data: { purpose: "mentoring" },
      });
    });
  });
});
