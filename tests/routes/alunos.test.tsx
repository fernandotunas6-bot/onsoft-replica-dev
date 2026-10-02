// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  emitRealtime,
  realtimeBindingsFor,
  renderRoute,
  resetCurrentAccount,
  resetPersistedFilters,
  resetRealtime,
  resetRouteLocation,
  routeComponentOf,
  setRouteSearch,
} from "./_harness";
import type { PedagogicalWorkspace } from "@/features/academic/server";
import type { searchStudents } from "@/features/students/server";

/**
 * Smoke de render de `/alunos` — a listagem mais usada do sistema.
 *
 * Fixa o que só o render decide: o estado vazio muda de texto conforme a
 * categoria activa (dívida, candidatos, todos) e a categoria vem do deep link
 * `?action=`, que o dashboard usa para mandar a secretaria directamente aos
 * candidatos por confirmar. Fixa também as cinco subscrições realtime: são
 * cinco tabelas escritas à mão e um nome errado não dá erro nenhum — só uma
 * lista que nunca actualiza (a classe de bug do Ciclo 54).
 */

type StudentRow = Awaited<ReturnType<typeof searchStudents>>[number];

// Montar uma rota real em jsdom leva ~1s isolado, mas passa facilmente dos 5s
// por omissão quando a suite inteira corre em paralelo (o handoff já regista
// falhas por carga da máquina no Ciclo 71). Timeout explícito para estes
// testes: fica a medir o render, não a fila de CPU.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());
vi.mock("@/integrations/supabase/client", async () =>
  (await import("./_harness")).supabaseClientMock(),
);

const searchStudentsMock = vi.fn();
const searchPeopleMock = vi.fn();
const listEnrollmentApplicationsMock = vi.fn();
const listPedagogicalWorkspaceMock = vi.fn();

vi.mock("@/features/students/server", () => ({
  searchStudents: () => searchStudentsMock(),
  changeStudentStatus: vi.fn(),
  enrollStudentInClass: vi.fn(),
}));

vi.mock("@/features/people/server", () => ({
  searchPeople: () => searchPeopleMock(),
}));

vi.mock("@/features/enrollment/server", () => ({
  listEnrollmentApplications: () => listEnrollmentApplicationsMock(),
}));

vi.mock("@/features/academic/server", () => ({
  listPedagogicalWorkspace: () => listPedagogicalWorkspaceMock(),
}));

/** Workspace vazio mas com a forma completa — se o tipo mudar, o tsc parte aqui. */
const emptyWorkspace: PedagogicalWorkspace = {
  academicYears: [],
  courses: [],
  gradeLevels: [],
  rooms: [],
  classGroups: [],
  subjects: [],
  classSubjects: [],
  termGrades: [],
  enrollmentOptions: [],
  scheduleSlots: [],
  subjectsAvailable: true,
  gradesAvailable: true,
  scheduleAvailable: true,
};

/** Sem cast: tem de satisfazer a forma real devolvida por `searchStudents`. */
const aluno: StudentRow = {
  id: "aluno-1",
  registration_number: "2026-0001",
  full_name: "Nzola Miguel",
  email: "nzola@escola.ao",
  phone: "+244923000111",
  photo_url: null,
  national_id: null,
  student_status: "active",
  payment_status: "em_dia",
  debt_amount: 0,
  overdue_count: 0,
  has_debt: false,
  total_billed: 0,
  total_paid: 0,
  grade_name: "10ª Classe",
  class_name: "10ª A",
  class_group_id: "turma-1",
  academic_year: "2026/2027",
  primary_guardian_name: "Ana Miguel",
  person_id: "pessoa-1",
  school_id: "escola-teste",
};

function seed({ students = [] as StudentRow[] } = {}) {
  searchStudentsMock.mockResolvedValue(students);
  searchPeopleMock.mockResolvedValue([]);
  listEnrollmentApplicationsMock.mockResolvedValue([]);
  listPedagogicalWorkspaceMock.mockResolvedValue(emptyWorkspace);
}

let Alunos: ComponentType;

// O `import` da rota arrasta um grafo de módulos grande e passa dos 5s de
// timeout por omissão do Vitest à primeira vez. Fica no `beforeAll`, com
// timeout próprio, para os testes em si medirem só o render.
beforeAll(async () => {
  Alunos = routeComponentOf(await import("@/routes/alunos/index"));
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetCurrentAccount();
  resetRealtime();
  resetPersistedFilters();
});

describe("/alunos — render", () => {
  it("atravessa a transição loading → carregado e lista o aluno", async () => {
    seed({ students: [aluno] });

    renderRoute(Alunos);

    expect(screen.getByText("A carregar estudantes…")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Nzola Miguel")).toBeDefined();
    });
    expect(screen.getByText("2026-0001")).toBeDefined();
  });

  it("mostra o estado vazio geral quando a escola não tem alunos", async () => {
    seed();

    renderRoute(Alunos);

    await waitFor(() => {
      expect(screen.getByText("Nenhum aluno encontrado")).toBeDefined();
    });
    expect(screen.queryByText("Nenhum candidato pendente")).toBeNull();
  });

  it("adapta o estado vazio ao deep link `?action=confirmar` do dashboard", async () => {
    seed({ students: [aluno] });
    setRouteSearch({ action: "confirmar" });

    renderRoute(Alunos);

    // O aluno activo não é candidato: a lista fica vazia, e o texto tem de
    // falar de candidatos — dizer «nenhum aluno encontrado» aqui mandava a
    // secretaria procurar um problema que não existe.
    await waitFor(() => {
      expect(screen.getByText("Nenhum candidato pendente")).toBeDefined();
    });
    expect(screen.queryByText("Nenhum aluno encontrado")).toBeNull();
  });

  it("encaminha para a Área Pedagógica quando ainda não há turmas", async () => {
    seed({ students: [aluno] });

    renderRoute(Alunos);

    await waitFor(() => {
      expect(screen.getByText("Preparar turmas na Área Pedagógica")).toBeDefined();
    });
  });

  it("subscreve as cinco tabelas que mudam a listagem e recarrega ao receber evento", async () => {
    seed({ students: [aluno] });

    renderRoute(Alunos);

    await waitFor(() => {
      expect(screen.getByText("Nzola Miguel")).toBeDefined();
    });

    // Uma tabela em falta (ou com o nome trocado) não dá erro: a lista fica
    // simplesmente desactualizada até alguém recarregar a página.
    for (const table of [
      "students",
      "enrollments",
      "finance_invoices",
      "finance_receipts",
      "enrollment_applications",
    ]) {
      expect(realtimeBindingsFor(table)).toHaveLength(1);
    }

    searchStudentsMock.mockResolvedValue([
      aluno,
      { ...aluno, id: "aluno-2", full_name: "Kiala Domingos", registration_number: "2026-0002" },
    ]);
    emitRealtime("students");

    await waitFor(() => {
      expect(screen.getByText("Kiala Domingos")).toBeDefined();
    });
  });
});

/**
 * A mesma rota a 375px.
 *
 * Isto não é um teste de aparência: se a troca de vista deixar de acontecer, o
 * telemóvel volta a receber a tabela de nove colunas — que existe, responde e
 * parece funcionar, enquanto nenhum nome se lê por inteiro. É uma regressão que
 * nenhum teste de lógica apanha e que ninguém nota até abrir o telefone.
 */
describe("/alunos — render no telemóvel", () => {
  const setViewport = (width: number) =>
    Object.defineProperty(window, "innerWidth", {
      value: width,
      configurable: true,
      writable: true,
    });

  afterEach(() => setViewport(1024));

  it("a 375px lista os alunos como entidades e não monta a tabela", async () => {
    setViewport(375);
    seed({ students: [aluno] });

    renderRoute(Alunos);

    await waitFor(() => {
      expect(screen.getByText("Nzola Miguel")).toBeDefined();
    });

    // A linha traz o que decide uma acção: nº, classe e turma.
    expect(screen.getByText(/2026-0001/)).toBeDefined();
    expect(screen.getByText(/10ª Classe/)).toBeDefined();

    // E o cabeçalho da tabela de computador não existe no DOM — se existisse,
    // era porque as duas vistas estavam montadas ao mesmo tempo.
    expect(screen.queryByText("Encarregado")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("cada aluno tem um menu de acções identificado pelo nome", async () => {
    setViewport(375);
    seed({ students: [aluno] });

    renderRoute(Alunos);

    await waitFor(() => {
      expect(screen.getByLabelText("Acções de Nzola Miguel")).toBeDefined();
    });
  });

  it("a 1280px continua a montar a tabela", async () => {
    setViewport(1280);
    seed({ students: [aluno] });

    renderRoute(Alunos);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeDefined();
    });
    expect(screen.getByText("Encarregado")).toBeDefined();
  });
});
