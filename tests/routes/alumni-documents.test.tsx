// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { listAlumni } from "@/features/alumni/server";
import type { getAlumniDocumentWorkspace } from "@/features/alumni/documents";

/**
 * Testes de montagem e render de `/alumni/documents`.
 *
 * Valida:
 * 1. Sem Alumni seleccionado, nenhuma secção de workspace aparece e
 *    `getAlumniDocumentWorkspace` nunca é chamado.
 * 2. Seleccionar um Alumni carrega o workspace: dados do Alumni, histórico
 *    de pedidos com o rótulo de estado traduzido, e modelos disponíveis.
 * 3. Estado vazio de histórico quando o Alumni não tem pedidos.
 */

type AlumniRow = Awaited<ReturnType<typeof listAlumni>>[number];
type Workspace = Awaited<ReturnType<typeof getAlumniDocumentWorkspace>>;

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listAlumniMock = vi.fn();
const getAlumniDocumentWorkspaceMock = vi.fn();

vi.mock("@/features/alumni/server", () => ({
  listAlumni: () => listAlumniMock(),
}));

vi.mock("@/features/alumni/documents", () => ({
  getAlumniDocumentWorkspace: (input: unknown) => getAlumniDocumentWorkspaceMock(input),
}));

const sampleAlumni = {
  id: "al-1",
  full_name: "Beatriz Ndongo",
  student_number: "2015-0042",
} as AlumniRow;

const sampleWorkspace: Workspace = {
  alumni: {
    id: "al-1",
    studentId: "stu-1",
    fullName: "Beatriz Ndongo",
    photoUrl: null,
    studentNumber: "2015-0042",
    graduationYear: 2020,
    graduationCourse: "Informática",
  },
  requests: [
    {
      id: "req-1",
      status: "approved",
      purpose: "Candidatura a emprego",
      createdAt: "2026-01-10T00:00:00Z",
      updatedAt: "2026-01-12T00:00:00Z",
      templateName: "Declaração de Habilitações",
      documentType: "declaracao",
    },
  ],
  availableTemplates: [
    { id: "tpl-1", name: "Certidão de Habilitações", document_type: "certidao" },
  ],
} as Workspace;

const emptyWorkspace: Workspace = {
  ...sampleWorkspace,
  requests: [],
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.documents");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/documents", () => {
  it("sem Alumni seleccionado, não mostra workspace nem chama getAlumniDocumentWorkspace", async () => {
    listAlumniMock.mockResolvedValue([sampleAlumni]);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByRole("option", { name: /Beatriz Ndongo/ });
    expect(screen.queryByText("Histórico de pedidos")).toBeNull();
    expect(getAlumniDocumentWorkspaceMock).not.toHaveBeenCalled();
  });

  it("seleccionar um Alumni carrega o workspace com pedidos e modelos", async () => {
    listAlumniMock.mockResolvedValue([sampleAlumni]);
    getAlumniDocumentWorkspaceMock.mockResolvedValue(sampleWorkspace);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByRole("option", { name: /Beatriz Ndongo/ });
    const select = screen.getByDisplayValue("Seleccionar Alumni…");
    fireEvent.change(select, { target: { value: "al-1" } });

    await waitFor(() => {
      expect(getAlumniDocumentWorkspaceMock).toHaveBeenCalledWith({ data: { alumniId: "al-1" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Declaração de Habilitações")).toBeDefined();
    });
    expect(screen.getByText("Aprovado")).toBeDefined();
    expect(screen.getByText("Certidão de Habilitações")).toBeDefined();
    expect(screen.getByText(/Processo 2015-0042/)).toBeDefined();
  });

  it("mostra o estado vazio de histórico quando o Alumni não tem pedidos", async () => {
    listAlumniMock.mockResolvedValue([sampleAlumni]);
    getAlumniDocumentWorkspaceMock.mockResolvedValue(emptyWorkspace);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByRole("option", { name: /Beatriz Ndongo/ });
    const select = screen.getByDisplayValue("Seleccionar Alumni…");
    fireEvent.change(select, { target: { value: "al-1" } });

    await waitFor(() => {
      expect(
        screen.getByText("Ainda não existem pedidos de documento para este Alumni."),
      ).toBeDefined();
    });
  });
});
