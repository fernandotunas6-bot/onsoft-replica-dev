// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetPersistedFilters,
  resetRouteLocation,
  routeComponentOf,
} from "./_harness";
import type { PedagogicalWorkspace } from "@/features/academic/server";
import type { LessonPlansResult } from "@/features/lesson-plans/server";

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock(),
);

const sampleWorkspace: PedagogicalWorkspace = {
  academicYears: [{ id: "ay-1", name: "2025", code: "2025" }],
  courses: [],
  gradeLevels: [],
  rooms: [],
  classGroups: [
    {
      id: "turma-1",
      academic_year_id: "ay-1",
      name: "Turma 7A",
      code: "7A",
      shift: "morning",
      status: "active",
      campus_id: null,
      capacity: 30,
      whatsapp_invite_url: null,
      whatsapp_group_name: null,
      course_id: "cp-1",
      course_name: "Ensino Primário",
      grade_name: "7ª Classe",
      room_id: null,
      room_name: "Sala 1",
      campus_name: "—",
      academic_year_name: "2025",
      enrolled_count: 20,
      average_score: null,
      attendance_rate: null,
    },
  ],
  subjects: [
    {
      id: "sub-1",
      name: "Matemática",
      code: "MAT",
      teacher_name: null,
      weekly_hours: 4,
      grade_from: 1,
      grade_to: 12,
      classes_label: "Todas",
      weekly_hours_label: "4h",
      approval_rate: null,
      curriculum_area_id: "area-1",
    },
    {
      id: "sub-2",
      name: "Língua Portuguesa",
      code: "LP",
      teacher_name: null,
      weekly_hours: 4,
      grade_from: 1,
      grade_to: 12,
      classes_label: "Todas",
      weekly_hours_label: "4h",
      approval_rate: null,
      curriculum_area_id: "area-2",
    },
  ],
  classSubjects: [],
  termGrades: [],
  enrollmentOptions: [],
  scheduleSlots: [],
  subjectsAvailable: true,
  gradesAvailable: true,
  scheduleAvailable: true,
};

const samplePlansResult: LessonPlansResult = {
  available: true,
  plans: [
    {
      id: "plan-1",
      class_group_id: "turma-1",
      subject_id: "sub-1",
      term: 1,
      title: "Geometria Espacial & Álgebra",
      content: "Plano do 1º trimestre contendo 3 avaliações contínuas e 1 prova.",
      file_id: null,
      file_name: null,
      status: "published",
      updated_at: "2025-02-01T10:00:00Z",
      created_by: "user-1",
      class_group_name: "Turma 7A",
      subject_name: "Matemática",
      components: [
        { id: "c-1", kind: "avaliacao", name: "AC1", planned_count: 3, sequence: 1 },
        { id: "c-2", kind: "prova", name: "PP1", planned_count: 1, sequence: 2 },
      ],
    },
    {
      id: "plan-2",
      class_group_id: "turma-1",
      subject_id: "sub-2",
      term: 2,
      title: "Gramática e Sintaxe",
      content: "Plano do 2º trimestre",
      file_id: "file-doc",
      file_name: "gramatica-programa.pdf",
      status: "draft",
      updated_at: "2025-02-01T10:00:00Z",
      created_by: "user-1",
      class_group_name: "Turma 7A",
      subject_name: "Língua Portuguesa",
      components: [{ id: "c-3", kind: "avaliacao", name: "AC2", planned_count: 2, sequence: 1 }],
    },
  ],
};

const listPedagogicalWorkspaceMock = vi.fn();
const listLessonPlansMock = vi.fn();
const deleteLessonPlanMock = vi.fn();

vi.mock("@/features/academic/server", () => ({
  listPedagogicalWorkspace: () => listPedagogicalWorkspaceMock(),
}));

vi.mock("@/features/lesson-plans/server", () => ({
  listLessonPlans: (args: unknown) => listLessonPlansMock(args),
  deleteLessonPlan: (args: unknown) => deleteLessonPlanMock(args),
}));

vi.mock("@/features/lesson-plans/LessonPlanModal", () => ({
  LessonPlanModal: ({ open, initial }: { open: boolean; initial: any }) =>
    open ? (
      <div data-testid="lesson-plan-modal">
        Modal Aberto: {initial ? `Editar ${initial.title}` : "Novo Plano"}
      </div>
    ) : null,
}));

let Page: ComponentType;

beforeAll(async () => {
  const mod = await import("@/routes/planos-aula");
  Page = routeComponentOf(mod);
}, 60_000);

beforeEach(() => {
  listPedagogicalWorkspaceMock.mockResolvedValue(sampleWorkspace);
  listLessonPlansMock.mockResolvedValue(samplePlansResult);
  deleteLessonPlanMock.mockResolvedValue({ success: true });
  resetPersistedFilters();
  resetRouteLocation();
});

afterEach(() => {
  cleanup();
});

describe("/planos-aula", () => {
  it("monta o ecrã com título, filtros e lista de planos agrupados por trimestre", async () => {
    renderRoute(Page);

    expect(screen.getByRole("heading", { name: "Planos de Aula" })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Geometria Espacial & Álgebra")).toBeDefined();
      expect(screen.getByText("Gramática e Sintaxe")).toBeDefined();
      expect(screen.getAllByText("1º Trimestre").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("2º Trimestre").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Publicado")).toBeDefined();
      expect(screen.getByText("Rascunho")).toBeDefined();
      expect(screen.getByText("gramatica-programa.pdf")).toBeDefined();
    });
  });

  it("mostra o estado vazio amigável quando não existem planos cadastrados", async () => {
    listLessonPlansMock.mockResolvedValue({ available: true, plans: [] });
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não há planos de aula")).toBeDefined();
    });
  });

  it("mostra aviso SQL quando a tabela ainda não foi criada na base de dados", async () => {
    listLessonPlansMock.mockResolvedValue({ available: false, plans: [] });
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText(/Tabelas de planos de aula em falta/)).toBeDefined();
    });
  });

  it("abre o modal para criação de novo plano ao clicar em 'Novo plano'", async () => {
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Geometria Espacial & Álgebra")).toBeDefined();
    });

    const newBtn = screen.getByRole("button", { name: /Novo plano/ });
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByTestId("lesson-plan-modal")).toBeDefined();
      expect(screen.getByText(/Modal Aberto: Novo Plano/)).toBeDefined();
    });
  });

  it("permite acionar remoção de plano após confirmação", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Geometria Espacial & Álgebra")).toBeDefined();
    });

    const removeButtons = screen.getAllByRole("button", { name: /Remover/ });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(deleteLessonPlanMock).toHaveBeenCalledWith({
        data: { id: "plan-1" },
      });
    });
  });
});
