// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, resetRouteLocation, routeComponentOf } from "./_harness";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";

vi.setConfig({ testTimeout: 35_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock(),
);

vi.mock("@/features/arquivos/local-store", () => ({
  listLocalFiles: vi.fn().mockResolvedValue([]),
  saveLocalFile: vi.fn().mockResolvedValue(undefined),
  saveLocalFolder: vi.fn().mockResolvedValue(undefined),
  deleteLocalFile: vi.fn().mockResolvedValue(undefined),
  patchLocalFileMeta: vi.fn().mockResolvedValue(undefined),
  localStoragePath: vi.fn().mockReturnValue("local/path"),
}));

const listSchoolFilesMock = vi.fn();
const listArquivosClassOptionsMock = vi.fn();
const listArquivosUserOptionsMock = vi.fn();
const listFolderTrailMock = vi.fn();
const listSchoolFileActivityMock = vi.fn();

vi.mock("@/features/arquivos/server", () => ({
  listSchoolFiles: (args: unknown) => listSchoolFilesMock(args),
  listArquivosClassOptions: () => listArquivosClassOptionsMock(),
  listArquivosUserOptions: () => listArquivosUserOptionsMock(),
  listFolderTrail: (args: unknown) => listFolderTrailMock(args),
  listSchoolFileActivity: (args: unknown) => listSchoolFileActivityMock(args),
  signSchoolFiles: vi.fn().mockResolvedValue({ urls: {} }),
  logSchoolFileEvent: vi.fn().mockResolvedValue(undefined),
}));

const sampleFile: SchoolFileRecord = {
  id: "file-1",
  schoolId: "escola-teste",
  ownerUserId: "user-teste",
  name: "Regulamento Interno 2026.pdf",
  mime: "application/pdf",
  kind: "pdf",
  sizeBytes: 1024 * 500,
  area: "secretaria",
  visibility: "school",
  storageBackend: "sga",
  storagePath: "docs/regulamento.pdf",
  classGroupId: null,
  parentId: null,
  isFolder: false,
  title: null,
  description: "Manual de convivência e normas disciplinares.",
  category: "outro",
  documentDate: "2026-02-01",
  referenceCode: "REG-2026-01",
  relatedUserId: null,
  relatedPersonId: null,
  relatedUserName: null,
  relatedPersonName: null,
  isSystem: false,
  createdAt: "2026-02-01T10:00:00.000Z",
  updatedAt: "2026-02-01T10:00:00.000Z",
  updatedByUserId: null,
  lastAction: "created",
  lastActionAt: "2026-02-01T10:00:00.000Z",
  lastActionByUserId: null,
  ownerName: "Secretaria Geral",
  updatedByName: null,
  lastActionByName: "Secretaria Geral",
  ownerAvatarUrl: null,
  updatedByAvatarUrl: null,
  lastActionByAvatarUrl: null,
};

const sampleFolder: SchoolFileRecord = {
  ...sampleFile,
  id: "folder-1",
  name: "Planificações Pedagógicas",
  mime: "inode/directory",
  kind: "folder",
  sizeBytes: 0,
  isFolder: true,
  title: null,
  description: "Pastas por trimestre",
};

beforeEach(() => {
  listFolderTrailMock.mockResolvedValue({ trail: [] });
  listArquivosClassOptionsMock.mockResolvedValue([]);
  listArquivosUserOptionsMock.mockResolvedValue([]);
  listSchoolFileActivityMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  resetRouteLocation();
  localStorage.clear();
  vi.clearAllMocks();
});

async function loadArquivosPage(): Promise<ComponentType> {
  const mod = await import("@/routes/arquivos");
  return routeComponentOf(mod);
}

describe("/arquivos — render", () => {
  it("carrega a biblioteca e mostra arquivos e pastas na área Secretaria", async () => {
    listSchoolFilesMock.mockResolvedValue({
      files: [sampleFolder, sampleFile],
      schoolId: "escola-teste",
      backend: "sga",
    });

    const ArquivosPage = await loadArquivosPage();
    renderRoute(ArquivosPage);

    await waitFor(() => {
      expect(screen.getByText("Regulamento Interno 2026.pdf")).toBeDefined();
      expect(screen.getByText("Planificações Pedagógicas")).toBeDefined();
    });

    expect(screen.getByRole("heading", { name: "Arquivos" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Biblioteca da escola" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Secretaria Reservado/ })).toBeDefined();
  });

  it("mostra o estado vazio quando não existem arquivos na pasta", async () => {
    listSchoolFilesMock.mockResolvedValue({
      files: [],
      schoolId: "escola-teste",
      backend: "sga",
    });

    const ArquivosPage = await loadArquivosPage();
    renderRoute(ArquivosPage);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum ficheiro nesta área/i)).toBeDefined();
    });
  });

  it("selecciona um arquivo e actualiza o painel lateral de detalhes", async () => {
    listSchoolFilesMock.mockResolvedValue({
      files: [sampleFile],
      schoolId: "escola-teste",
      backend: "sga",
    });

    const ArquivosPage = await loadArquivosPage();
    renderRoute(ArquivosPage);

    await waitFor(() => {
      expect(screen.getByText("Regulamento Interno 2026.pdf")).toBeDefined();
    });

    const fileRow = screen.getByText("Regulamento Interno 2026.pdf");
    fireEvent.click(fileRow);

    await waitFor(() => {
      expect(screen.getAllByText("REG-2026-01").length).toBeGreaterThan(1);
      expect(screen.getByText("Manual de convivência e normas disciplinares.")).toBeDefined();
    });
  });

  it("permite mudar de repositório para a Escola", async () => {
    listSchoolFilesMock.mockResolvedValue({
      files: [sampleFile],
      schoolId: "escola-teste",
      backend: "sga",
    });

    const ArquivosPage = await loadArquivosPage();
    renderRoute(ArquivosPage);

    await waitFor(() => {
      expect(screen.getByText("Regulamento Interno 2026.pdf")).toBeDefined();
    });

    const escolaBtn = screen.getByRole("button", { name: "Biblioteca da escola" });
    fireEvent.click(escolaBtn);

    await waitFor(() => {
      expect(listSchoolFilesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            area: "escola",
          }),
        }),
      );
    });
  });
});
