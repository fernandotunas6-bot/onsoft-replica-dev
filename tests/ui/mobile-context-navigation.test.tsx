// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentPropsWithRef } from "react";
import { MoreHub } from "@/components/mobile/MoreHub";
const state = vi.hoisted(() => ({
  pathname: "/faturas",
  search: {} as Record<string, unknown>,
  role: "Administrador",
  schoolId: "school-a",
  teachingLevels: [] as string[],
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ school: { pedagogy: { teachingLevels: state.teachingLevels } } }),
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({
    role: state.role,
    grants: {},
    schoolId: state.schoolId,
    schoolName: "Escola de demonstração",
  }),
}));
vi.mock("@/features/saas/tenant-context", () => ({ useTenant: () => ({ activePlan: null }) }));
vi.mock("@/features/auth/use-sign-out", () => ({
  useSignOut: () => ({ signOut: vi.fn(), signingOut: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: state.pathname, search: state.search } }),
  Link: ({
    to,
    search,
    ...props
  }: ComponentPropsWithRef<"a"> & { to: string; search?: unknown }) => (
    <a
      {...props}
      href={to}
      data-search={JSON.stringify(search)}
      onClick={(event) => {
        event.preventDefault();
        props.onClick?.(event);
      }}
    />
  ),
}));
afterEach(() => {
  cleanup();
  state.pathname = "/faturas";
  state.role = "Administrador";
  state.schoolId = "school-a";
  state.search = {};
  state.teachingLevels = [];
});
describe("menu mobile contextual", () => {
  it.each([
    { levels: [], label: "Matricular Aluno" },
    { levels: ["superior"], label: "Matricular Estudante" },
    { levels: ["superior", "primario"], label: "Matricular Aluno" },
  ])("usa o vocabulário institucional com níveis $levels", ({ levels, label }) => {
    state.teachingLevels = levels;
    state.pathname = "/alunos";
    const close = vi.fn();
    render(<MoreHub open onOpenChange={close} />);
    const destination = screen.getByRole("link", { name: label });
    expect(destination.getAttribute("href")).toBe("/alunos");
    expect(JSON.parse(destination.getAttribute("data-search")!)).toEqual({ action: "matricular" });
    fireEvent.click(destination);
    expect(close).toHaveBeenCalledWith(false);
  });
  it("pesquisa estudantes no Superior e repõe os rótulos ao mudar de escola", async () => {
    state.teachingLevels = ["superior"];
    const view = render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "estudante" } });
    expect(await screen.findByRole("link", { name: "Matricular Estudante" })).toBeTruthy();
    state.schoolId = "school-b";
    state.teachingLevels = ["primario"];
    state.pathname = "/alunos";
    view.rerender(<MoreHub open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Matricular Aluno" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Matricular Estudante" })).toBeNull();
  });
  it("mantém as áreas autorizadas no portal do estudante do Superior", () => {
    state.teachingLevels = ["superior"];
    state.role = "Aluno";
    state.pathname = "/pedagogica";
    state.search = { tab: "notas" };
    render(<MoreHub open onOpenChange={vi.fn()} />);
    expect(
      screen.getByRole("link", { name: "Avaliações e Notas" }).getAttribute("aria-current"),
    ).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.getByRole("button", { name: "Académico" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: "Secretaria" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Matricular Estudante" })).toBeNull();
  });
  it.each(["escola", "rota"])("descarta a pesquisa pendente quando muda a %s", async (change) => {
    vi.useFakeTimers();
    try {
      const view = render(<MoreHub open onOpenChange={vi.fn()} />);
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Matricular" } });
      if (change === "escola") state.schoolId = "school-b";
      else state.pathname = "/tesouraria";
      view.rerender(<MoreHub open onOpenChange={vi.fn()} />);
      await act(async () => vi.advanceTimersByTime(100));
      expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
      expect(screen.queryByRole("link", { name: "Matricular Aluno" })).toBeNull();
      expect(screen.getByRole("link", { name: "Faturas" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([
    ["/alunos/aluno-teste", {}, "Secretaria", "Financeiro"],
    ["/alunos", { action: "matricular" }, "Secretaria", "Financeiro"],
    ["/faturas/fatura-teste", {}, "Financeiro", "Secretaria"],
  ])("mantém a área actual no catálogo em %s", (pathname, search, active, inactive) => {
    state.pathname = pathname;
    state.search = search;
    render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.getByRole("button", { name: active }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: inactive }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: inactive }));
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.getByRole("button", { name: active }).getAttribute("aria-current")).toBe("true");
    expect(screen.queryByRole("link", { current: "page" })).toBeNull();
  });
  it("mostra o módulo activo, permite mudar de área e fecha ao escolher um destino", () => {
    const close = vi.fn();
    render(<MoreHub open onOpenChange={close} />);
    expect(screen.getByRole("link", { name: "Faturas" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Relatórios Financeiros" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Matricular Aluno" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.queryByRole("link", { name: "Faturas" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    fireEvent.click(screen.getByRole("link", { name: "Matricular Aluno" }));
    expect(close).toHaveBeenCalledWith(false);
  });
  it("pesquisa noutras áreas sem perder os parâmetros de navegação", async () => {
    render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Matricular" } });
    const link = await screen.findByRole("link", { name: "Matricular Aluno" });
    expect(JSON.parse(link.getAttribute("data-search")!)).toEqual({ action: "matricular" });
  });
  it("retira áreas administrativas e repõe o contexto ao mudar de perfil", async () => {
    const view = render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    state.role = "Aluno";
    state.pathname = "/pedagogica";
    state.search = { tab: "presencas" };
    view.rerender(<MoreHub open onOpenChange={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Secretaria" })).toBeNull());
    expect(screen.queryByRole("link", { name: "Configurações da Escola" })).toBeNull();
    expect(screen.getByRole("link", { name: "Frequência" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
  it("encontra páginas sem acentos e repõe o contexto ao limpar", async () => {
    render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  relatorios  " } });
    expect(await screen.findByRole("link", { name: "Relatórios Académicos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar pesquisa" }));
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Relatórios Académicos" })).toBeNull(),
    );
    expect(screen.getByRole("link", { name: "Faturas" })).toBeTruthy();
  });
  it("encontra uma área pelo nome sem expandir outras áreas", async () => {
    render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "FINANCEIRO" } });
    expect(await screen.findByRole("link", { name: "Tesouraria" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Matricular Aluno" })).toBeNull();
  });
  it("a pesquisa por área mantém os limites do perfil", async () => {
    state.role = "Aluno";
    render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "secretaria" } });
    expect(await screen.findByText(/Nenhum resultado/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Matricular Aluno" })).toBeNull();
  });
  it("organiza o portal do aluno por módulo e mantém os atalhos gerais directos", () => {
    state.role = "Aluno";
    state.pathname = "/pedagogica";
    state.search = { tab: "notas" };
    const close = vi.fn();
    render(<MoreHub open onOpenChange={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.getByRole("button", { name: "Académico" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: "Portal do Aluno" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Calendário Lectivo" }));
    expect(close).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Académico" }));
    expect(screen.getByRole("link", { name: "Frequência" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Avaliações e Notas" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Matricular Aluno" })).toBeNull();
  });
  it("encontra secções académicas pelo nome da área no portal do aluno", async () => {
    state.role = "Aluno";
    render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "academico" } });
    expect(await screen.findByRole("link", { name: "Avaliações e Notas" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Frequência" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Financeiro" })).toBeNull();
  });
});
