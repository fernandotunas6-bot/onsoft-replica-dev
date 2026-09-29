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

vi.mock("@/features/academic/academic-structure", () => ({
  getAcademicStructureStatus: () =>
    Promise.resolve({
      yearName: "2025/2026",
      yearActive: true,
      activeRuleSets: 1,
      subjects: 12,
      terms: 3,
      classGroups: 4,
      classSubjects: 40,
      classSubjectsWithTeacher: 37,
      enrollments: 120,
      assessments: 8,
      gradebooks: { open: 30, closed: 10 },
      gradeSheets: { draft: 4 },
      pendingGradeChanges: 0,
      historyRecords: 0,
      auditEvents30d: 55,
    }),
}));

vi.mock("@/features/academic/assessment-models", () => ({
  getAssessmentModels: () =>
    Promise.resolve({
      scale: { name: "Escala 0–20", minimum: 0, maximum: 20, decimalPlaces: 0 },
      subjects: [{ id: "s1", name: "Matemática" }],
      canPublish: true,
      versions: [
        {
          id: "r2",
          version: 2,
          status: "active",
          name: "Decreto Executivo n.º 424/25",
          continuousWeight: 50,
          examWeight: 50,
          passingValue: 10,
          maximumAbsencePercentage: 33,
          roundingMethod: "nearest",
          gradeChangeRequiresApproval: true,
          lockAfterPublication: true,
          keySubjectIds: ["s1"],
          keySubjectsCauseFailure: true,
          createdAt: "2026-09-20T10:00:00Z",
          createdByName: "Direcção",
        },
        {
          id: "r1",
          version: 1,
          status: "retired",
          name: "Regra principal de avaliação",
          continuousWeight: 40,
          examWeight: 60,
          passingValue: 10,
          maximumAbsencePercentage: 25,
          roundingMethod: "up",
          gradeChangeRequiresApproval: false,
          lockAfterPublication: false,
          keySubjectIds: [],
          keySubjectsCauseFailure: true,
          createdAt: "2026-09-01T10:00:00Z",
          createdByName: null,
        },
      ],
    }),
  publishAssessmentModel: vi.fn(),
  getActivePassingValue: () => Promise.resolve({ passingValue: 10 }),
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
  room_id: null,
  room_name: "Sala 1",
  campus_name: "—",
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
    setRouteSearch({ tab: "turmas" });

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
    setRouteSearch({ tab: "turmas" });

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

  it("a direcção abre na estrutura académica, com o estado real de cada módulo", async () => {
    seed();

    renderRoute(Pedagogica);

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: /Estrutura académica/i }).getAttribute("data-state"),
      ).toBe("active");
    });
    await waitFor(() => {
      expect(screen.getByText("3 sem professor")).toBeDefined();
    });
    expect(screen.getByText("Percurso da informação")).toBeDefined();
    expect(screen.getByText("Sem épocas de exame")).toBeDefined();
  });

  it("mostra o modelo de avaliação em vigor e as versões anteriores", async () => {
    seed();
    setRouteSearch({ tab: "modelos" });

    renderRoute(Pedagogica);

    await waitFor(() => {
      expect(screen.getByText("Decreto Executivo n.º 424/25")).toBeDefined();
    });
    expect(screen.getByText("MT = (MAC + NPT) ÷ 2")).toBeDefined();
    expect(screen.getByText("Matemática (negativa reprova)")).toBeDefined();
    expect(screen.getByText("Versões anteriores")).toBeDefined();
    expect(screen.getByRole("button", { name: "Nova versão" })).toBeDefined();
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
