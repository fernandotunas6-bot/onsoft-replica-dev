// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetPersistedFilters,
  resetRouteLocation,
  routeComponentOf,
} from "./_harness";
import type { listTeachers, searchPeople } from "@/features/people/server";

/**
 * Testes de montagem e render de `/pessoas`.
 *
 * Valida o registo central de pessoas e a gestão de docentes:
 * 1. Transição de loading para carregado exibindo tabelas de professores e registo central.
 * 2. Estados vazios amigáveis para professores e registo central.
 * 3. Ramo de erro da API com feedback visual resiliente.
 */

type PersonRow = Awaited<ReturnType<typeof searchPeople>>[number];
type TeacherRow = Awaited<ReturnType<typeof listTeachers>>[number];

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());

const searchPeopleMock = vi.fn();
const listTeachersMock = vi.fn();

vi.mock("@/features/people/server", () => ({
  searchPeople: () => searchPeopleMock(),
  listTeachers: () => listTeachersMock(),
  getPerson: vi.fn(),
  createTeacher: vi.fn(),
  updateTeacher: vi.fn(),
  deleteTeacher: vi.fn(),
  updatePerson: vi.fn(),
  updatePersonStatus: vi.fn(),
  mergePeople: vi.fn(),
  addPersonDocument: vi.fn(),
}));

vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: {
      id: "sch-1",
      name: "Complexo Escolar Teste",
      nif: "5417009999",
      academic_year: "2025/2026",
    },
    selectedYearLabel: "Ano Lectivo 2025/2026",
  }),
}));

vi.mock("@/features/integrations/use-installed-integrations", () => ({
  useInstalledIntegrations: () => ({
    hasCapability: () => false,
    isInstalled: () => false,
    granted: new Set(),
  }),
}));

vi.mock("@/features/arquivos/person-photo-url", () => ({
  prefetchPersonPhotoUrls: vi.fn(),
  resolvePersonPhotoUrl: vi.fn().mockResolvedValue(null),
}));

const sampleTeacher: TeacherRow = {
  id: "tch-1",
  person_id: "per-1",
  full_name: "Prof. Manuel dos Santos",
  email: "prof.manuel@escola.ao",
  phone: "923111222",
  photo_url: null,
  employee_number: "DOC-000001",
  status: "active",
  hired_on: "2024-02-01",
  employment_type: "full_time",
  updated_at: "2026-03-01T10:00:00Z",
};

const samplePerson: PersonRow = {
  id: "per-1",
  full_name: "Manuel dos Santos",
  email: "prof.manuel@escola.ao",
  phone_primary: "923111222",
  status: "active",
  birth_date: "1985-05-15",
  nif: "001234567LA032",
  photo_url: null,
  province: "Luanda",
  municipality: "Luanda",
  commune: "Maianga",
  address: "Rua Direita",
  updated_at: "2026-03-01T10:00:00Z",
  roles: ["professor"],
};

function seed({
  people = [] as PersonRow[],
  teachers = [] as TeacherRow[],
}: {
  people?: PersonRow[];
  teachers?: TeacherRow[];
} = {}) {
  searchPeopleMock.mockResolvedValue(people);
  listTeachersMock.mockResolvedValue(teachers);
}

let PessoasRouteComponent: ComponentType;

beforeAll(async () => {
  const mod = await import("@/routes/pessoas/index");
  PessoasRouteComponent = routeComponentOf(mod);
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetPersistedFilters();
});

describe("/pessoas — render", () => {
  it("renderiza a listagem de professores e o registo central quando há dados", async () => {
    seed({ people: [samplePerson], teachers: [sampleTeacher] });
    renderRoute(PessoasRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("DOC-000001")).toBeDefined();
      expect(screen.getByText("Prof. Manuel dos Santos")).toBeDefined();
      expect(screen.getByText("Manuel dos Santos")).toBeDefined();
    });
  });

  it("apresenta os estados vazios quando não existem registos", async () => {
    seed({ people: [], teachers: [] });
    renderRoute(PessoasRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("Nenhum professor neste filtro")).toBeDefined();
      expect(screen.getByText("Nenhuma pessoa encontrada")).toBeDefined();
    });
  });

  it("exibe mensagem de erro quando a pesquisa de pessoas falha", async () => {
    searchPeopleMock.mockRejectedValue(new Error("Falha na consulta ao Postgres"));
    listTeachersMock.mockResolvedValue([]);

    renderRoute(PessoasRouteComponent);

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível pesquisar pessoas: Falha na consulta ao Postgres"),
      ).toBeDefined();
    });
  });
});
