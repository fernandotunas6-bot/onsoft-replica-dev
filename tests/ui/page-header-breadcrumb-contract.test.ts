// @vitest-environment jsdom
import { createElement, type ComponentPropsWithRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActiveContext, type ActiveContextValue } from "@/features/intelligence/active-context";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    ...props
  }: ComponentPropsWithRef<"a"> & { to?: string; search?: Record<string, string | undefined> }) =>
    createElement("a", { ...props, href: to, "data-search": JSON.stringify(search) }),
}));
afterEach(cleanup);

function header(props: Partial<Parameters<typeof PageHeader>[0]> = {}) {
  return render(
    createElement(PageHeader, {
      group: "Académico",
      title: "Turmas",
      description: "Consulte as turmas.",
      ...props,
    }),
  );
}

describe("PageHeader — hierarquia e orientação", () => {
  it("apresenta o grupo como contexto e apenas a página final como actual", () => {
    const { container } = header();
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Início" }).getAttribute("href")).toBe("/portal");
    expect(within(nav).getByText("Académico").getAttribute("aria-current")).toBeNull();
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe("Turmas");
    expect(container.querySelector("li li")).toBeNull();
  });
  it("não repete grupo e página com o mesmo nome", () => {
    header({ group: " documentos ", title: "Documentos" });
    expect(
      screen.getByRole("navigation").querySelectorAll("li:not([role=presentation])"),
    ).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Documentos");
  });
  it("omite grupos vazios", () => {
    header({ group: " " });
    expect(
      screen.getByRole("navigation").querySelectorAll("li:not([role=presentation])"),
    ).toHaveLength(2);
  });
  it("não acrescenta texto nem margem de descrição quando esta está vazia", () => {
    const { container } = header({ description: " " });
    expect(container.querySelector("h1")?.parentElement?.querySelector("p")).toBeNull();
  });
  it("preserva os caminhos e parâmetros de breadcrumbs explícitos", () => {
    header({
      crumbs: [
        { label: "Início", to: "/portal" },
        { label: "Turmas", to: "/pedagogica", search: { tab: "turmas" } },
        { label: "10.ª A" },
      ],
    });
    const link = within(screen.getByRole("navigation")).getByRole("link", { name: "Turmas" });
    expect(link.getAttribute("href")).toBe("/pedagogica");
    expect(JSON.parse(link.getAttribute("data-search") ?? "null")).toEqual({ tab: "turmas" });
  });
  it("não repete o título quando o breadcrumb está oculto", () => {
    header({ group: "Documentos", title: "Documentos", hideBreadcrumb: true, description: "" });
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getAllByText("Documentos")).toHaveLength(1);
  });
});

/** Contexto que a AppShell daria para a pauta de Matemática da 10.ª A. */
const pautaDeMatematica = {
  context: null,
  crumbs: {
    page: { to: "/pedagogica", search: { tab: "notas" } },
    frames: [
      { label: "10.ª A", to: "/pedagogica", search: { tab: "notas", turma: "t-a", pauta: "1" } },
      {
        label: "Matemática",
        to: "/pedagogica",
        search: { tab: "notas", turma: "t-a", disciplina: "d-m", pauta: "1" },
      },
    ],
  },
} satisfies ActiveContextValue;

function headerInContext(
  value: ActiveContextValue,
  props: Partial<Parameters<typeof PageHeader>[0]> = {},
) {
  return render(
    createElement(
      ActiveContext.Provider,
      { value },
      createElement(PageHeader, {
        group: "Académico",
        title: "Área Pedagógica",
        description: "",
        ...props,
      }),
    ),
  );
}

const passos = () =>
  Array.from(
    screen.getByRole("navigation").querySelectorAll("li:not([role=presentation])"),
    (item) => item.textContent,
  );

describe("PageHeader — contexto da URL", () => {
  it("põe a turma e a disciplina depois do título, cada uma com o seu nível", () => {
    headerInContext(pautaDeMatematica);
    expect(passos()).toEqual(["Início", "Académico", "Área Pedagógica", "10.ª A", "Matemática"]);
    const nav = screen.getByRole("navigation");
    const pagina = within(nav).getByRole("link", { name: "Área Pedagógica" });
    expect(pagina.getAttribute("href")).toBe("/pedagogica");
    expect(JSON.parse(pagina.getAttribute("data-search") ?? "null")).toEqual({ tab: "notas" });
    const turma = within(nav).getByRole("link", { name: "10.ª A" });
    expect(JSON.parse(turma.getAttribute("data-search") ?? "null")).toEqual({
      tab: "notas",
      turma: "t-a",
      pauta: "1",
    });
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe("Matemática");
    // O título da página não muda.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Área Pedagógica");
  });

  it("um breadcrumb explícito da página manda sobre o contexto", () => {
    headerInContext(pautaDeMatematica, {
      crumbs: [{ label: "Início", to: "/portal" }, { label: "Pautas" }],
    });
    expect(passos()).toEqual(["Início", "Pautas"]);
  });

  it("na página da própria entidade não repete o título", () => {
    const professora = {
      context: null,
      crumbs: { page: null, frames: [{ label: "Maria Domingos" }] },
    } satisfies ActiveContextValue;
    headerInContext(professora, { title: "Maria Domingos" });
    expect(passos()).toEqual(["Início", "Académico", "Maria Domingos"]);
  });
});
