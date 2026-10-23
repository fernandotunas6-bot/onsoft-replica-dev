import { describe, expect, it } from "vitest";
import {
  getNavigationContext,
  isContextDestinationActive,
} from "@/features/auth/contextual-navigation";
import { getPortalNavigation } from "@/features/auth/portal-engine";

describe("contextual navigation", () => {
  const groups = getPortalNavigation("Administrador");
  it("keeps the home as the global entry point", () => {
    expect(getNavigationContext(groups, "/portal")).toBeNull();
  });
  it("flattens only the existing financial module", () => {
    const context = getNavigationContext(groups, "/faturas");
    expect(context?.title).toBe("Financeiro");
    expect(context?.items.some((item) => item.to === "/tesouraria")).toBe(true);
    expect(context?.items.some((item) => item.to === "/relatorios/financeiros")).toBe(true);
    expect(getNavigationContext(groups, "/relatorios/financeiros")?.items).toEqual(context?.items);
    expect(context?.items.some((item) => item.to === "/alunos")).toBe(false);
    expect(context?.items.every((item) => !item.children)).toBe(true);
  });
  it("resolves detail routes without prefix collisions", () => {
    expect(getNavigationContext(groups, "/alunos/123")?.title).toBe("Gestão de Alunos");
    expect(getNavigationContext(groups, "/alunos-inexistentes")).toBeNull();
  });
  it("uses search parameters to distinguish attendance from academic tabs", () => {
    const student = getPortalNavigation("Aluno");
    expect(getNavigationContext(student, "/pedagogica", { tab: "presencas" })?.title).toBe(
      "Frequência",
    );
    expect(getNavigationContext(student, "/pedagogica", { tab: "notas" })?.title).toBe("Académico");
  });
  it("cannot reintroduce a module absent from the allowed catalogue", () => {
    const allowed = groups.filter((group) => group.title !== "Financeiro");
    expect(getNavigationContext(allowed, "/faturas")).toBeNull();
    expect(getNavigationContext([], "/faturas")).toBeNull();
  });
  it("não reintroduz relatórios retirados do catálogo autorizado", () => {
    const allowed = groups.filter((group) => group.title !== "Relatórios");
    expect(
      getNavigationContext(allowed, "/financeiro")?.items.some(
        (item) => item.to === "/relatorios/financeiros",
      ),
    ).toBe(false);
  });
  it("highlights the specific action instead of its generic list", () => {
    expect(
      isContextDestinationActive({ to: "/alunos" }, groups, "/alunos", { action: "matricular" }),
    ).toBe(false);
    expect(
      isContextDestinationActive(
        { to: "/alunos", search: { action: "matricular" } },
        groups,
        "/alunos",
        { action: "matricular" },
      ),
    ).toBe(true);
  });
  it("keeps the parent destination selected on detail pages", () => {
    expect(isContextDestinationActive({ to: "/alunos" }, groups, "/alunos/123", {})).toBe(true);
    expect(
      isContextDestinationActive({ to: "/financeiro" }, groups, "/financeiro/rh/folha", {}),
    ).toBe(false);
  });
});
