// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetPersistedFilters,
  resetRouteLocation,
  routeComponentOf,
  setRouteSearch,
} from "./_harness";
import type { PedagogicalWorkspace } from "@/features/academic/server";

/**
 * Smoke de render de `/pedagogica` — a rota com mais estado do sistema: aba
 * activa vinda da query string, permissões por papel, cinco queries e seis
 * módulos de workspace montados por aba.
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

const listPedagogicalWorkspaceMock = vi.fn();
const listRoomsMock = vi.fn();
const listSubjectTypesMock = vi.fn();
const listCurriculumAreasMock = vi.fn();
const listTeachersMock = vi.fn();

vi.mock("@/features/academic/server", () => ({
  listPedagogicalWorkspace: () => listPedagogicalWorkspaceMock(),
  listRooms: () => listRoomsMock(),
  listSubjectTypes: () => listSubjectTypesMock(),
  listCurriculumAreas: () => listCurriculumAreasMock(),
  createAdvancedScheduleSlot: vi.fn(),
  updateAdvancedScheduleSlot: vi.fn(),
  deleteScheduleSlot: vi.fn(),
  publishAcademicSchedule: vi.fn(),
  ensureAcademicDefaults: vi.fn(),
  upsertTermGrade: vi.fn(),
}));

vi.mock("@/features/people/server", () => ({
  listTeachers: () => listTeachersMock(),
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
  academic_year_name: "2025/2026",
  enrolled_count: 12,
  average_score: null,
  attendance_rate: null,
};

function seed(workspace: Partial<PedagogicalWorkspace> = {}) {
  listPedagogicalWorkspaceMock.mockResolvedValue({ ...emptyWorkspace, ...workspace });
  listRoomsMock.mockResolvedValue([]);
  listSubjectTypesMock.mockResolvedValue([]);
  listCurriculumAreasMock.mockResolvedValue([]);
  listTeachersMock.mockResolvedValue([]);
}

let Pedagogica: ComponentType;

beforeAll(async () => {
  Pedagogica = routeComponentOf(await import("@/routes/pedagogica"));
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetPersistedFilters();
});

describe("/pedagogica — render", () => {
  it("cai no ecrã de bootstrap enquanto a estrutura académica não existir", async () => {
    // Sem anos lectivos / cursos / classes, `structureReady` é falso e a aba de
    // turmas devolve cedo — mesmo havendo turmas no workspace.
    seed({ classGroups: [turma] });

    renderRoute(Pedagogica);

    await waitFor(() => {
      expect(screen.getByText("Estrutura académica em falta")).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: "Turma 10ª A" })).toBeNull();
  });

  it("lista as turmas quando a estrutura está semeada", async () => {
    seed({
      academicYears: [{ id: "ano-1", name: "2025/2026", code: "2025" }],
      courses: [{ id: "curso-1", name: "Ciências Físicas e Biológicas", code: "CFB" }],
      gradeLevels: [{ id: "classe-1", name: "10ª Classe", code: "10" }],
      classGroups: [turma],
    });

    renderRoute(Pedagogica);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Área Pedagógica/i })).toBeDefined();
    });
    // A turma tem de chegar mesmo ao DOM: sem esta asserção o teste passaria
    // com o workspace vazio e não provava que o caminho de dados corre.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Turma 10ª A" })).toBeDefined();
    });
    expect(screen.queryByText("Nenhuma turma neste filtro")).toBeNull();
  });

  it("abre directamente na aba pedida pela query string", async () => {
    seed();
    setRouteSearch({ tab: "horarios" });

    renderRoute(Pedagogica);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Área Pedagógica/i })).toBeDefined();
    });
    const horarios = screen.getByRole("tab", { name: /Horários/i });
    expect(horarios.getAttribute("data-state")).toBe("active");
  });
});
