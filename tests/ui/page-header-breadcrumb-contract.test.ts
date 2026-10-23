// @vitest-environment jsdom
import { createElement, type ComponentPropsWithRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PageHeader } from "@/components/layout/PageHeader";

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
