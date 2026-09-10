// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetPersistedFilters,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
} from "./_harness";
import type { PedagogicalWorkspace } from "@/features/academic/server";

/**
 * Smoke de render de `/relatorios/academicos`.
 *
 * Três coisas que só o render decide: o corte por papel (a query nem sequer
 * arranca — `enabled: canRead` — e o teste fixa isso, porque um papel sem
 * acesso a pautas não deve gerar tráfego nenhum para o servidor), o aviso de
 * migração académica incompleta (que substitui todos os indicadores, em vez de
 * os mostrar a zero) e a tabela de desempenho por turma.
 */

// Montar uma rota real em jsdom leva ~1s isolado, mas passa facilmente dos 5s
// por omissão quando a suite inteira corre em paralelo (o handoff já regista
// falhas por carga da máquina no Ciclo 71). Timeout explícito para estes
// testes: fica a medir o render, não a fila de CPU.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock(),
);

// Pré-busca dos chunks de `recharts` ao montar: é optimização de rede, não
// parte do contrato de render, e no jsdom só deixava imports a resolver depois
// do teste terminar.
vi.mock("@/lib/warm-charts", () => ({ warmReportCharts: vi.fn() }));

const listPedagogicalWorkspaceMock = vi.fn();

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

/** Sem cast: tem de satisfazer `ClassGroupSummary` a sério. */
const turma: PedagogicalWorkspace["classGroups"][number] = {
  id: "turma-1",
  academic_year_id: "ano-1",
  name: "10ª A",
  code: "10A",
  shift: "morning",
  status: "active",
  campus_id: null,
  capacity: 30,
  whatsapp_invite_url: null,
  whatsapp_group_name: null,
  course_id: "curso-1",
  course_name: "Ciências Físicas e Biológicas",
  grade_name: "10ª Classe",
  room_name: "Sala 1",
  academic_year_name: "2026/2027",
  enrolled_count: 24,
  average_score: null,
  attendance_rate: null,
};

const nota: PedagogicalWorkspace["termGrades"][number] = {
  id: "nota-1",
  enrollment_id: "mat-1",
  subject_id: "disc-1",
  term: 1,
  mac: 14,
  npp: 15,
  npt: 16,
  average: 15,
  student_id: "aluno-1",
  student_name: "Nzola Miguel",
  student_photo_url: null,
  registration_number: "2026-0001",
  class_group_id: "turma-1",
  class_group_name: "10ª A",
  subject_name: "Matemática",
  term_label: "1º Trimestre",
  updated_at: "2026-09-01T10:00:00.000Z",
};

function seed(workspace: Partial<PedagogicalWorkspace> = {}) {
  listPedagogicalWorkspaceMock.mockResolvedValue({ ...emptyWorkspace, ...workspace });
}

let Relatorios: ComponentType;

// O `import` da rota arrasta um grafo de módulos grande e passa dos 5s de
// timeout por omissão do Vitest à primeira vez. Fica no `beforeAll`, com
// timeout próprio, para os testes em si medirem só o render.
beforeAll(async () => {
  Relatorios = routeComponentOf(await import("@/routes/relatorios.academicos"));
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetCurrentAccount();
  resetPersistedFilters();
});

describe("/relatorios/academicos — render", () => {
  it("atravessa a transição loading → carregado e mostra o desempenho da turma", async () => {
    seed({ classGroups: [turma], termGrades: [nota] });

    renderRoute(Relatorios);

    expect(screen.getByText("A carregar indicadores académicos…")).toBeDefined();

    await waitFor(() => {
      expect(screen.getAllByText("10ª A").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("heading", { name: "Relatórios Académicos" })).toBeDefined();
    expect(screen.getByText("Ciências Físicas e Biológicas")).toBeDefined();
  });

  it("diz que ainda não há turmas em vez de uma tabela vazia", async () => {
    seed();

    renderRoute(Relatorios);

    await waitFor(() => {
      expect(screen.getByText("Ainda não há turmas na escola.")).toBeDefined();
    });
  });

  it("substitui os indicadores pelo aviso quando a migração académica falta", async () => {
    seed({ classGroups: [turma], gradesAvailable: false });

    renderRoute(Relatorios);

    await waitFor(() => {
      expect(screen.getByText("Migração académica incompleta")).toBeDefined();
    });
    // Indicadores a zero sobre tabelas inexistentes seriam lidos como resultado
    // real da escola: o painel inteiro tem de desaparecer, não ficar a "—".
    expect(screen.queryByText("Média geral")).toBeNull();
    expect(screen.queryByText("Desempenho por turma")).toBeNull();
  });

  it("nega o acesso — e não chega a pedir dados — a papéis sem pedagógica", async () => {
    seed({ classGroups: [turma], termGrades: [nota] });
    setCurrentAccount({ role: "Tesouraria" });

    renderRoute(Relatorios);

    await waitFor(() => {
      expect(screen.getByText("Sem permissão para relatórios académicos")).toBeDefined();
    });
    expect(listPedagogicalWorkspaceMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Nzola Miguel")).toBeNull();
  });

  it("mostra o erro do servidor em vez de indicadores a zero", async () => {
    listPedagogicalWorkspaceMock.mockRejectedValue(
      new Error("Sem membership activa nesta escola."),
    );

    renderRoute(Relatorios);

    await waitFor(() => {
      expect(screen.getByText("Sem membership activa nesta escola.")).toBeDefined();
    });
    expect(screen.queryByText("Ainda não há turmas na escola.")).toBeNull();
  });
});
