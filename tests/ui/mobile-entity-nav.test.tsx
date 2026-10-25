// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentPropsWithRef } from "react";
import { ActiveContextProvider } from "@/components/layout/ActiveContextProvider";
import { MoreHub } from "@/components/mobile/MoreHub";

/**
 * Menu da entidade no telemóvel (SIGA Context Engine). O hub «Mais» é a sidebar
 * do telemóvel: com uma turma, disciplina ou aluno aberto e confirmado pelo
 * servidor, mostra o mesmo menu que a sidebar do computador. O caminho todo é o
 * real: URL → AppShell (ActiveContextProvider) → resolvedor → registo → hub.
 */

vi.setConfig({ testTimeout: 20_000 });

const state = vi.hoisted(() => ({
  pathname: "/alunos",
  search: {} as Record<string, unknown>,
  role: "Secretaria",
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (value: unknown) => unknown }) =>
    select({ location: { pathname: state.pathname, search: state.search } }),
  Link: ({
    to,
    search,
    ...props
  }: ComponentPropsWithRef<"a"> & { to: string; search?: unknown }) => (
    <a
      {...props}
      href={to}
      data-search={JSON.stringify(search ?? null)}
      onClick={(event) => {
        event.preventDefault();
        props.onClick?.(event);
      }}
    />
  ),
}));

// Uma conta estável por papel: um objecto novo a cada render faria a resolução
// do contexto correr sem fim.
const accounts = vi.hoisted(() => {
  const base = {
    id: "user-1",
    grants: {},
    name: "Conta Teste",
    initials: "CT",
    avatarUrl: null,
    schoolId: "school-a",
    schoolName: "Escola de demonstração",
    isAlumni: false,
  };
  return Object.fromEntries(
    ["Administrador", "Secretaria", "Professor", "Encarregado"].map((role) => [
      role,
      { ...base, role, roles: [role] },
    ]),
  ) as Record<string, Record<string, unknown>>;
});
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => accounts[state.role],
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ school: { pedagogy: { teachingLevels: [] } } }),
}));
vi.mock("@/features/saas/tenant-context", () => ({ useTenant: () => ({ activePlan: null }) }));
vi.mock("@/features/auth/use-sign-out", () => ({
  useSignOut: () => ({ signOut: vi.fn(), signingOut: false }),
}));

const TURMA_A = "11111111-1111-4111-8111-111111111111";
const MATEMATICA = "33333333-3333-4333-8333-333333333333";
const ANA = "44444444-4444-4444-8444-444444444444";

// Turmas e disciplinas que o servidor devolveria à conta.
const academic = vi.hoisted(() => ({ tree: [] as unknown[] }));
vi.mock("@/features/academic/use-academic-nav-tree", () => ({
  useAcademicNavTree: () => ({ tree: academic.tree, schoolId: "school-a" }),
}));

// O aluno que a ficha leu do servidor (a entidade que a página declara em foco).
const focus = vi.hoisted(() => ({
  entity: null as null | { type: "student"; id: string; label: string; schoolId: string },
}));
vi.mock("@/features/intelligence/entity-focus-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/intelligence/entity-focus-context")>()),
  useEntityFocus: () => ({
    focusedEntity: focus.entity ? { ...focus.entity, data: null } : null,
    setFocusedEntity: () => {},
    clearFocusedEntity: () => {},
    panelCollapsed: true,
    setPanelCollapsed: () => {},
  }),
}));

afterEach(() => {
  cleanup();
  state.pathname = "/alunos";
  state.search = {};
  state.role = "Secretaria";
  academic.tree = [];
  focus.entity = null;
});

const ana = { type: "student" as const, id: ANA, label: "Ana Silva", schoolId: "school-a" };

function openHub(onOpenChange = vi.fn()) {
  render(
    <ActiveContextProvider>
      <MoreHub open onOpenChange={onOpenChange} />
    </ActiveContextProvider>,
  );
  return onOpenChange;
}

function openStudent(search: Record<string, unknown> = {}) {
  state.role = "Secretaria";
  state.pathname = `/alunos/${ANA}`;
  state.search = search;
  focus.entity = ana;
}

const searchOf = (link: HTMLElement) => JSON.parse(link.getAttribute("data-search") ?? "null");

describe("hub «Mais» — menu do aluno", () => {
  it("mostra o aluno e as secções da ficha em vez do catálogo do módulo", () => {
    openStudent({ secao: "financeiro" });
    openHub();

    const menu = screen.getByRole("region", { name: "Aluno: Ana Silva" });
    expect(menu.textContent).toContain("Aluno · Ana Silva");
    const back = within(menu).getByRole("link", { name: "Voltar a Secretaria" });
    expect(back.getAttribute("href")).toBe("/alunos");

    const sections = within(menu)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === `/alunos/${ANA}`)
      .map((link) => [link.textContent, searchOf(link)]);
    expect(sections).toEqual([
      ["Ficha completa", {}],
      ["Identificação", { secao: "identificacao" }],
      ["Académico", { secao: "academico" }],
      ["Financeiro", { secao: "financeiro" }],
      ["Documentos", { secao: "documentos" }],
    ]);
    expect(
      within(menu).getByRole("link", { name: "Financeiro" }).getAttribute("aria-current"),
    ).toBe("page");
    // Como na sidebar, o catálogo do módulo sai enquanto o aluno está aberto.
    expect(screen.queryByRole("link", { name: "Matricular Aluno" })).toBeNull();
  });

  it("escolher uma secção fecha o hub, porque só muda a pesquisa da URL", () => {
    openStudent();
    const close = openHub();
    fireEvent.click(screen.getByRole("link", { name: "Identificação" }));
    expect(close).toHaveBeenCalledWith(false);
  });

  it("«Todas as áreas» mostra o catálogo, e «Voltar ao módulo» devolve o menu do aluno", () => {
    openStudent();
    openHub();
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.queryByRole("region", { name: "Aluno: Ana Silva" })).toBeNull();
    expect(screen.getByRole("button", { name: "Secretaria" }).getAttribute("aria-current")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao módulo" }));
    expect(screen.getByRole("region", { name: "Aluno: Ana Silva" })).toBeTruthy();
  });

  it("a pesquisa continua a procurar no catálogo todo", async () => {
    openStudent();
    openHub();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Matricular" } });
    expect(await screen.findByRole("link", { name: "Matricular Aluno" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Aluno: Ana Silva" })).toBeNull();
  });

  it("enquanto a ficha não leu o aluno do servidor, o hub fica como estava", () => {
    openStudent();
    focus.entity = null;
    openHub();
    expect(screen.queryByRole("region", { name: /^Aluno/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Matricular Aluno" })).toBeTruthy();
  });

  it("o encarregado não recebe o menu de gestão do aluno", () => {
    openStudent();
    state.role = "Encarregado";
    openHub();
    expect(screen.queryByRole("region", { name: /^Aluno/ })).toBeNull();
  });
});

describe("hub «Mais» — menu da disciplina", () => {
  const tree = [
    {
      id: "grade:10ª classe",
      label: "10ª Classe",
      kind: "grade",
      classTeacher: false,
      classes: [
        {
          id: TURMA_A,
          name: "Turma A",
          classTeacher: false,
          subjects: [{ id: MATEMATICA, name: "Matemática" }],
        },
      ],
    },
  ];

  it("mostra a disciplina com a turma por baixo, e a função actual marcada", () => {
    state.role = "Professor";
    state.pathname = "/pedagogica";
    state.search = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA, pauta: "1" };
    academic.tree = tree;
    openHub();

    const menu = screen.getByRole("region", { name: "Disciplina: Matemática" });
    expect(menu.textContent).toContain("Disciplina · Matemática");
    expect(menu.textContent).toContain("Turma A");
    const back = within(menu).getByRole("link", { name: /^Voltar a / });
    expect(back.getAttribute("href")).toBe("/pedagogica");
    expect(searchOf(back)).toEqual({ tab: "notas" });
    const notas = within(menu).getByRole("link", { name: "Avaliações e notas" });
    expect(notas.getAttribute("aria-current")).toBe("page");
    expect(searchOf(notas)).toEqual({
      tab: "notas",
      turma: TURMA_A,
      disciplina: MATEMATICA,
      pauta: "1",
    });
    expect(within(menu).getByRole("link", { name: "Planos de aula" }).getAttribute("href")).toBe(
      "/planos-aula",
    );
  });

  it("uma turma que o servidor não devolveu à conta não muda o hub", () => {
    state.role = "Professor";
    state.pathname = "/pedagogica";
    state.search = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA };
    academic.tree = [];
    openHub();
    expect(screen.queryByRole("region", { name: /Disciplina|Turma/ })).toBeNull();
  });
});
