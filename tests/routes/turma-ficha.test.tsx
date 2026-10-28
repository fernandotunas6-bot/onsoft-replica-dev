// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
  setRouteParams,
  setRouteSearch,
} from "./_harness";

/**
 * `/pedagogica/turmas/$turmaId`: a ficha da turma em página (do main, #346), com
 * `?secao=` do SIGA Context Engine para o menu levar a uma secção, e só a turma que
 * o servidor devolve à conta.
 */

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/integrations/supabase/client", async () =>
  (await import("./_harness")).supabaseClientMock(),
);
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock({ role: "Secretaria" }),
);

const TURMA = "11111111-1111-4111-8111-111111111111";

const workspace = {
  academicYears: [],
  courses: [],
  gradeLevels: [],
  rooms: [],
  classGroups: [
    {
      id: TURMA,
      academic_year_id: "ano-1",
      name: "10.ª A",
      code: "10A",
      shift: "morning",
      status: "active",
      campus_id: null,
      capacity: 35,
      whatsapp_invite_url: null,
      whatsapp_group_name: null,
      course_id: null,
      course_name: "Ciências Físicas e Biológicas",
      grade_name: "10.ª",
      room_id: null,
      room_name: "Sala 4",
      campus_name: "—",
      academic_year_name: "2026/2027",
      enrolled_count: 2,
      average_score: 13.4,
      attendance_rate: 92,
    },
  ],
  subjects: [],
  classSubjects: [
    {
      class_group_id: TURMA,
      subject_id: "fis",
      subject_name: "Física",
      teacher_id: "prof-1",
      teacher_name: "João Neto",
    },
  ],
  termGrades: [],
  enrollmentOptions: [
    {
      id: "m-1",
      class_group_id: TURMA,
      student_id: "aluno-1",
      student_name: "Ana Paula Silva",
      registration_number: "2026-0142",
      label: "Ana Paula Silva",
    },
    {
      id: "m-2",
      class_group_id: "outra",
      student_id: "aluno-2",
      student_name: "Bruno Kiala",
      registration_number: "2026-0150",
      label: "Bruno Kiala",
    },
  ],
  scheduleSlots: [],
  subjectsAvailable: true,
  gradesAvailable: true,
  scheduleAvailable: true,
};

const server = vi.hoisted(() => ({ workspace: vi.fn(), tasks: vi.fn() }));
vi.mock("@/features/academic/timetable-lessons", () => ({
  listClassTasks: server.tasks,
}));
vi.mock("@/features/academic/server", () => ({
  listPedagogicalWorkspace: server.workspace,
  listRooms: () => Promise.resolve([]),
  assignClassSubjectTeacher: vi.fn(),
  applyCurriculumToClassGroup: vi.fn(),
  deleteClassGroup: vi.fn(),
  updateClassGroup: vi.fn(),
}));
vi.mock("@/features/people/server", () => ({
  listTeachers: () => Promise.resolve([{ id: "prof-1", full_name: "João Neto" }]),
}));

let Page: ComponentType;

beforeAll(async () => {
  Page = routeComponentOf(await import("@/routes/pedagogica_.turmas.$turmaId"));
}, 60_000);

afterEach(() => {
  cleanup();
  resetRouteLocation();
  resetCurrentAccount();
  server.workspace.mockReset();
  server.tasks.mockReset();
});

function open(search: Record<string, unknown> = {}, role = "Secretaria", id = TURMA) {
  server.workspace.mockResolvedValue(workspace);
  setRouteParams({ turmaId: id });
  setRouteSearch(search);
  setCurrentAccount({ role, roles: [role] });
  renderRoute(Page);
}

describe("/pedagogica/turmas/$turmaId", () => {
  it("abre a ficha da turma, com o nome como título e todas as secções", async () => {
    open();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "10.ª A" })).toBeDefined(),
    );
    expect(screen.getByText("Ocupação")).toBeDefined();
    for (const name of [/^Resumo$/, /^Alunos \(1\)$/, /^Horário/, /^Avaliações$/]) {
      expect(screen.getByRole("region", { name })).toBeDefined();
    }
  });

  it("?secao=alunos leva aos alunos da turma, e só aos dela", async () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    try {
      open({ secao: "alunos" });
      await waitFor(() => expect(screen.getByText("Ana Paula Silva")).toBeDefined());
      expect(screen.queryByText("Bruno Kiala")).toBeNull();
      await waitFor(() => expect(scrolled).toContain("turma-alunos"));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("pesquisa por nome sem acentos e por processo apenas entre alunos da turma", async () => {
    const extraStudent = {
      ...workspace.enrollmentOptions[0]!,
      id: "m-3",
      student_id: "aluno-3",
      student_name: "Álvaro José",
      registration_number: "2026-0199",
      label: "Álvaro José",
    };
    workspace.enrollmentOptions.push(extraStudent);
    try {
      open({ secao: "alunos" });
      const roster = await screen.findByRole("region", { name: "Alunos (2)" });
      const search = within(roster).getByRole("searchbox", { name: "Procurar aluno nesta turma" });
      expect(
        within(roster)
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["Álvaro José2026-0199", "Ana Paula Silva2026-0142"]);
      fireEvent.change(search, { target: { value: "jose alvaro" } });
      expect(within(roster).getByRole("link").textContent).toBe("Álvaro José2026-0199");
      expect(within(roster).getByRole("status").textContent).toBe("1 de 2 alunos");
      fireEvent.change(search, { target: { value: "2026-0142" } });
      expect(within(roster).getByRole("link").textContent).toBe("Ana Paula Silva2026-0142");
      fireEvent.change(search, { target: { value: "Bruno" } });
      expect(within(roster).queryByRole("link")).toBeNull();
      expect(
        within(roster).getByText("Nenhum aluno corresponde à pesquisa nesta turma."),
      ).toBeDefined();
      fireEvent.click(within(roster).getByRole("button", { name: "Limpar pesquisa" }));
      expect(within(roster).getAllByRole("link")).toHaveLength(2);
    } finally {
      workspace.enrollmentOptions.pop();
    }
  });

  it("uma secção desconhecida abre a ficha sem erro", async () => {
    open({ secao: "nada" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "10.ª A" })).toBeDefined(),
    );
  });

  it("uma turma que o servidor não devolve mostra «Turma não encontrada»", async () => {
    open({}, "Secretaria", "99999999-9999-4999-8999-999999999999");
    await waitFor(() => expect(screen.getByText("Turma não encontrada")).toBeDefined());
    expect(screen.queryByText("Ocupação")).toBeNull();
  });

  it("o professor tem contexto da sua turma e não vê acções administrativas", async () => {
    server.tasks.mockResolvedValue({
      available: true,
      open: [
        {
          id: "tarefa-1",
          title: "Experiência de Física",
          subjectName: "Física",
          dueOn: "2026-11-10",
          description: null,
        },
      ],
      closed: [],
    });
    open({}, "Professor");
    await waitFor(() =>
      expect(screen.getByRole("complementary", { name: "Contexto do professor" })).toBeDefined(),
    );
    await waitFor(() => expect(screen.getByText("Experiência de Física")).toBeDefined());
    expect(server.tasks).toHaveBeenCalledWith({ data: { classGroupId: TURMA } });
    expect(screen.getByRole("link", { name: "Ver trabalhos e entregas" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Presenças e aulas realizadas" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Professor" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aplicar currículo do curso" })).toBeNull();
  });

  it("a Secretaria mantém gestão de turma e não carrega o painel do professor", async () => {
    open();
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar" })).toBeDefined());
    expect(screen.queryByRole("complementary", { name: "Contexto do professor" })).toBeNull();
    expect(server.tasks).not.toHaveBeenCalled();
  });

  it("aluno e encarregado não pedem a turma", async () => {
    open({}, "Encarregado");
    await waitFor(() => expect(screen.getByText("Turma não encontrada")).toBeDefined());
    expect(server.workspace).not.toHaveBeenCalled();
  });
});
