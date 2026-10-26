// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
  setRouteParams,
} from "./_harness";
import type { SchoolFileDetail } from "@/features/arquivos/file-detail";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";

/**
 * `/arquivos/<id>` (SIGA Context Engine, contexto Documentos e Arquivos): o
 * ficheiro que o servidor devolve à conta, a turma e o aluno ligados e a auditoria.
 */

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock({ role: "Secretaria" }),
);

const getSchoolFileDetailMock = vi.fn();
const listSchoolFileActivityMock = vi.fn();
vi.mock("@/features/arquivos/server", () => ({
  getSchoolFileDetail: (args: unknown) => getSchoolFileDetailMock(args),
  listSchoolFileActivity: (args: unknown) => listSchoolFileActivityMock(args),
  logSchoolFileEvent: async () => undefined,
  signSchoolFile: async () => ({ local: false, url: null }),
}));

const FICHEIRO = "44444444-4444-4444-8444-444444444444";
const TURMA = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222222";

const file: SchoolFileRecord = {
  id: FICHEIRO,
  schoolId: "school-a",
  ownerUserId: "dono",
  name: "certidao-nascimento.pdf",
  mime: "application/pdf",
  kind: "pdf",
  sizeBytes: 120_000,
  area: "secretaria",
  visibility: "school",
  storageBackend: "sga",
  storagePath: "",
  classGroupId: TURMA,
  parentId: null,
  isFolder: false,
  title: "Certidão de nascimento",
  description: "Cópia certificada entregue na matrícula",
  category: "bilhete",
  documentDate: "2026-09-01",
  referenceCode: "DOC-0042",
  relatedUserId: null,
  relatedPersonId: "pessoa-ana",
  relatedUserName: null,
  relatedPersonName: "Ana Paula Silva",
  isSystem: false,
  createdAt: "2026-09-02T10:00:00Z",
  updatedAt: null,
  updatedByUserId: null,
  lastAction: null,
  lastActionAt: null,
  lastActionByUserId: null,
  ownerName: "Rosa Mateus",
  updatedByName: null,
  lastActionByName: null,
  ownerAvatarUrl: null,
  updatedByAvatarUrl: null,
  lastActionByAvatarUrl: null,
};

const detail: SchoolFileDetail = {
  file,
  contentOpen: true,
  myAccess: "edit",
  classGroup: { id: TURMA, name: "10ª A" },
  student: { id: ANA, name: "Ana Paula Silva" },
};

let Page: ComponentType;

beforeAll(async () => {
  Page = routeComponentOf(await import("@/routes/arquivos_.$fileId"));
}, 60_000);

afterEach(() => {
  cleanup();
  getSchoolFileDetailMock.mockReset();
  listSchoolFileActivityMock.mockReset();
  resetRouteLocation();
  resetCurrentAccount();
});

function open(role = "Secretaria") {
  listSchoolFileActivityMock.mockResolvedValue({
    events: [
      {
        id: "e1",
        fileId: FICHEIRO,
        action: "opened",
        detail: null,
        actorUserId: "dono",
        actorName: "Rosa Mateus",
        actorAvatarUrl: null,
        createdAt: "2026-09-03T09:00:00Z",
      },
    ],
  });
  setRouteParams({ fileId: FICHEIRO });
  setCurrentAccount({ role, roles: [role] });
  renderRoute(Page);
}

describe("/arquivos/<id>", () => {
  it("mostra o ficheiro, a turma e o aluno ligados e a auditoria", async () => {
    getSchoolFileDetailMock.mockResolvedValue(detail);
    open();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Certidão de nascimento" }),
      ).toBeDefined(),
    );
    expect(getSchoolFileDetailMock).toHaveBeenCalledWith({ data: { id: FICHEIRO } });
    expect(screen.getByRole("button", { name: /Abrir/ })).toBeDefined();
    expect(screen.getByText("DOC-0042")).toBeDefined();
    const links = screen.getByRole("region", { name: "Ligado a" });
    expect(links.textContent).toContain("10ª A");
    expect(links.textContent).toContain("Ana Paula Silva");
    expect(screen.getByRole("link", { name: "Pasta da turma" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Documentos do aluno" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ficha do aluno" })).toBeDefined();
    const audit = screen.getByRole("region", { name: "Auditoria" });
    await waitFor(() => expect(audit.textContent).toContain("Rosa Mateus abriu"));
  });

  it("a tesouraria não abre fichas de alunos: o aluno aparece sem ligação", async () => {
    getSchoolFileDetailMock.mockResolvedValue(detail);
    open("Tesouraria");
    await waitFor(() => expect(screen.getAllByText("Ana Paula Silva").length).toBeGreaterThan(0));
    expect(screen.queryByRole("link", { name: "Ficha do aluno" })).toBeNull();
  });

  it("um ficheiro do sistema sem acesso ao conteúdo não mostra Abrir nem Descarregar", async () => {
    getSchoolFileDetailMock.mockResolvedValue({
      ...detail,
      contentOpen: false,
      file: { ...file, isSystem: true, description: null },
    });
    open("Professor");
    await waitFor(() => expect(screen.getByText(/Ficheiro do sistema/)).toBeDefined());
    expect(screen.queryByRole("button", { name: /Abrir/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Descarregar/ })).toBeNull();
  });

  it("ficheiro não encontrado", async () => {
    getSchoolFileDetailMock.mockResolvedValue(null);
    open();
    await waitFor(() => expect(screen.getByText("Ficheiro não encontrado")).toBeDefined());
  });

  it("quem não abre os Arquivos não faz o pedido", async () => {
    open("Encarregado");
    await waitFor(() => expect(screen.getByText("Sem acesso aos Arquivos")).toBeDefined());
    expect(getSchoolFileDetailMock).not.toHaveBeenCalled();
  });
});
