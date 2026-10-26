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

const server = vi.hoisted(() => ({ workspace: vi.fn() }));
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

  it("aluno e encarregado não pedem a turma", async () => {
    open({}, "Encarregado");
    await waitFor(() => expect(screen.getByText("Turma não encontrada")).toBeDefined());
    expect(server.workspace).not.toHaveBeenCalled();
  });
});
