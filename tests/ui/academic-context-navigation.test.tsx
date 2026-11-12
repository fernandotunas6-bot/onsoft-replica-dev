// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentPropsWithRef } from "react";
import { AcademicNavTree } from "@/components/layout/AcademicNavTree";
const state = vi.hoisted(() => ({
  role: "Administrador",
  schoolId: "school-a",
  primary: false,
  empty: false,
  ready: true,
  routeClass: null as string | null,
  routeSubject: null as string | null,
  routeTab: "notas",
  yearId: "year-a",
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({ role: state.role, grants: {}, schoolId: state.schoolId }),
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ selectedYearId: state.yearId, school: { id: state.schoolId } }),
}));
vi.mock("@/features/academic/server", () => ({
  getTeacherWorkspace: vi.fn(),
  listPedagogicalWorkspace: vi.fn(),
}));
vi.mock("@/lib/preload", () => ({ canPrefetchResources: () => false }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  useQuery: () => ({
    data: {
      classGroups: !state.ready
        ? []
        : [
            {
              id: "class-a",
              name: "10.ª A",
              grade_name: state.primary ? "2.ª Classe" : "10.ª Classe",
              course_name: "Ciências",
            },
            {
              id: "class-b",
              name: "11.ª B",
              grade_name: "11.ª Classe",
              course_name: "Humanidades",
            },
          ],
      subjects: [],
      classSubjects: state.empty
        ? []
        : [
            { class_group_id: "class-a", subject_id: "subject-a", subject_name: "Matemática" },
            { class_group_id: "class-b", subject_id: "subject-b", subject_name: "Português" },
            { class_group_id: "class-b", subject_id: "subject-c", subject_name: "História" },
          ],
      classes: [
        {
          id: "class-a",
          name: "10.ª A",
          grade_name: "10.ª Classe",
          course_name: "Ciências",
          subject_id: "subject-a",
          subject_name: "Matemática",
        },
      ],
    },
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ preloadRoute: vi.fn() }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string; search: Record<string, unknown> } }) => unknown;
  }) =>
    select({
      location: {
        pathname: "/pedagogica",
        search: { tab: state.routeTab, turma: state.routeClass, disciplina: state.routeSubject },
      },
    }),
  Link: ({
    to,
    search,
    activeOptions: _a,
    activeProps: _b,
    inactiveProps: _c,
    preload: _d,
    preloadDelay: _e,
    ...props
  }: ComponentPropsWithRef<"a"> & {
    to: string;
    search?: unknown;
    activeOptions?: unknown;
    activeProps?: unknown;
    inactiveProps?: unknown;
    preload?: unknown;
    preloadDelay?: unknown;
  }) => <a {...props} href={to} data-search={JSON.stringify(search)} />,
}));
afterEach(() => {
  cleanup();
  state.role = "Administrador";
  state.primary = false;
  state.empty = false;
  state.ready = true;
  state.routeClass = null;
  state.routeSubject = null;
  state.routeTab = "notas";
  state.yearId = "year-a";
  state.schoolId = "school-a";
});
describe("navegação académica real", () => {
  it("usa curso como contexto e limita a árvore a turma e disciplina", () => {
    const view = render(<AcademicNavTree />);
    expect(screen.getByRole("combobox", { name: "Curso ou nível" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "10.ª A" }));
    const link = screen.getByRole("link", { name: "Matemática" });
    expect(JSON.parse(link.getAttribute("data-search")!)).toEqual({
      tab: "notas",
      turma: "class-a",
      disciplina: "subject-a",
      pauta: "1",
    });
    expect(view.container.querySelector("ul ul ul")).toBeNull();
  });
  it("abre o curso e a turma de um link directo, mesmo com dados carregados depois", () => {
    state.routeClass = "class-b";
    state.ready = false;
    const view = render(<AcademicNavTree />);
    expect(screen.queryByRole("combobox")).toBeNull();
    state.ready = true;
    view.rerender(<AcademicNavTree />);
    expect(screen.getByRole("combobox", { name: "Curso ou nível" }).textContent).toContain(
      "Humanidades",
    );
    expect(screen.getByRole("link", { name: "Português" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Matemática" })).toBeNull();
  });
  it("não reabre a turma recolhida num rerender dos dados", () => {
    state.routeClass = "class-b";
    const view = render(<AcademicNavTree />);
    fireEvent.click(screen.getByRole("button", { name: "11.ª B" }));
    view.rerender(<AcademicNavTree />);
    expect(screen.queryByRole("link", { name: "Português" })).toBeNull();
  });
  it("acompanha a navegação para outra turma", () => {
    state.routeClass = "class-a";
    const view = render(<AcademicNavTree />);
    expect(screen.getByRole("link", { name: "Matemática" })).toBeTruthy();
    state.routeClass = "class-b";
    view.rerender(<AcademicNavTree />);
    expect(screen.getByRole("link", { name: "Português" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Matemática" })).toBeNull();
  });
  it("não cria destinos a partir de um ID desconhecido na URL", () => {
    state.routeClass = "class-unknown";
    render(<AcademicNavTree />);
    expect(screen.queryByRole("link", { name: "Português" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Matemática" })).toBeNull();
  });
  it("destaca só a disciplina aberta sem exigir o parâmetro pauta", () => {
    state.routeClass = "class-b";
    state.routeSubject = "subject-b";
    render(<AcademicNavTree />);
    expect(screen.getByRole("link", { name: "Português" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "História" }).getAttribute("aria-current")).toBeNull();
  });
  it("não marca a disciplina como notas ao abrir outro separador", () => {
    state.routeClass = "class-b";
    state.routeSubject = "subject-b";
    state.routeTab = "horarios";
    render(<AcademicNavTree />);
    expect(screen.getByRole("link", { name: "Português" }).getAttribute("aria-current")).toBeNull();
  });
  it("revela e destaca a nova disciplina após navegar dentro da mesma turma", () => {
    state.routeClass = "class-b";
    state.routeSubject = "subject-b";
    const view = render(<AcademicNavTree />);
    fireEvent.click(screen.getByRole("button", { name: "11.ª B" }));
    state.routeSubject = "subject-c";
    view.rerender(<AcademicNavTree />);
    expect(screen.getByRole("link", { name: "História" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Português" }).getAttribute("aria-current")).toBeNull();
  });
  it("marca a pauta do primário sem depender de parâmetros de apresentação", () => {
    state.primary = true;
    state.routeClass = "class-a";
    render(<AcademicNavTree />);
    expect(screen.getByRole("link", { name: "10.ª A" }).getAttribute("aria-current")).toBe("page");
  });
  it("fecha o painel académico ao trocar de ano lectivo", async () => {
    const view = render(<AcademicNavTree collapsed />);
    fireEvent.click(screen.getByRole("button", { name: "Turmas e disciplinas" }));
    await screen.findByRole("dialog", { name: "Navegação académica" });
    state.yearId = "year-b";
    view.rerender(<AcademicNavTree collapsed />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("mantém a turma secundária sem disciplinas como estado vazio", () => {
    state.empty = true;
    render(<AcademicNavTree />);
    fireEvent.click(screen.getByRole("button", { name: "10.ª A" }));
    expect(screen.getByText("Sem disciplina atribuída")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "10.ª A" })).toBeNull();
  });
  it("preserva a pauta da turma do primário", () => {
    state.primary = true;
    render(<AcademicNavTree />);
    expect(
      JSON.parse(screen.getByRole("link", { name: "10.ª A" }).getAttribute("data-search")!),
    ).toEqual({ tab: "notas", turma: "class-a", pauta: "1" });
    expect(screen.queryByRole("link", { name: "Matemática" })).toBeNull();
  });
  it("abre em portal na barra recolhida e devolve o foco com Escape", async () => {
    const view = render(
      <aside style={{ overflow: "hidden", width: 64 }}>
        <AcademicNavTree collapsed />
      </aside>,
    );
    const trigger = screen.getByRole("button", { name: "Turmas e disciplinas" });
    fireEvent.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "Navegação académica" });
    expect(view.container.contains(panel)).toBe(false);
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("preserva os atalhos das disciplinas do professor", () => {
    state.role = "Professor";
    render(<AcademicNavTree />);
    fireEvent.click(screen.getByRole("button", { name: "10.ª A" }));
    expect(
      JSON.parse(screen.getByRole("link", { name: "Matemática" }).getAttribute("data-search")!),
    ).toEqual({ tab: "notas", turma: "class-a", disciplina: "subject-a", pauta: "1" });
  });
  it("recolhe a turma aberta ao mudar de escola", () => {
    const view = render(<AcademicNavTree />);
    fireEvent.click(screen.getByRole("button", { name: "10.ª A" }));
    state.schoolId = "school-b";
    view.rerender(<AcademicNavTree />);
    expect(screen.queryByRole("link", { name: "Matemática" })).toBeNull();
  });
  it("não mostra destinos quando o perfil não pode abrir a área", () => {
    state.role = "Utilizador";
    const view = render(<AcademicNavTree />);
    expect(view.container.textContent).toBe("");
  });
});
