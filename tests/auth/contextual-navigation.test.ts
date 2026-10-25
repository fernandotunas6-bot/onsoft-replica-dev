import { describe, expect, it } from "vitest";
import {
  getNavigationContext,
  getNavigationAreas,
  isContextDestinationActive,
} from "@/features/auth/contextual-navigation";
import { getPortalNavigation, type NavItem } from "@/features/auth/portal-engine";

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
    expect(getNavigationContext(groups, "/alunos/123")?.title).toBe("Secretaria");
    expect(getNavigationContext(groups, "/alunos-inexistentes")).toBeNull();
  });
  it("uses search parameters to distinguish attendance from academic tabs", () => {
    const student = getPortalNavigation("Aluno");
    expect(getNavigationContext(student, "/pedagogica", { tab: "presencas" })?.title).toBe(
      "Académico",
    );
    expect(getNavigationContext(student, "/pedagogica", { tab: "notas" })?.title).toBe("Académico");
  });
  it("o perfil do professor fica na área de Pessoas, sem colidir com outros caminhos", () => {
    expect(getNavigationContext(groups, "/professores/123")).toEqual(
      getNavigationContext(groups, "/pessoas"),
    );
    expect(getNavigationContext(groups, "/professor/presenca")?.title).not.toBe("Secretaria");
  });
  it("mantém a Secretaria estável entre alunos, importações e documentos", () => {
    const context = getNavigationContext(groups, "/alunos/123");
    for (const path of ["/importar", "/documentos", "/pessoas"]) {
      expect(getNavigationContext(groups, path)).toEqual(context);
    }
  });
  it.each(["Aluno", "Encarregado", "Professor"])(
    "mantém ensino e frequência no mesmo contexto para %s",
    (role) => {
      const catalogue = getPortalNavigation(role as "Aluno" | "Encarregado" | "Professor");
      const academic = getNavigationContext(catalogue, "/pedagogica", { tab: "notas" });
      expect(getNavigationContext(catalogue, "/pedagogica", { tab: "presencas" })).toEqual(
        academic,
      );
      expect(academic?.items.every((item) => item.to !== "/financeiro")).toBe(true);
    },
  );
  it("mostra o perfil no seu próprio contexto", () => {
    expect(getNavigationContext(groups, "/perfil")?.items.map((item) => item.to)).toEqual([
      "/perfil",
    ]);
  });
  it("atribui uma única área a cada relatório e mantém todos os destinos", () => {
    const areas = getNavigationAreas(groups);
    expect(areas.some((area) => area.title === "Relatórios")).toBe(false);
    const destination = (item: { to?: string; search?: unknown }) =>
      JSON.stringify([item.to, item.search]);
    const before = groups
      .flatMap((g) => g.items.flatMap<NavItem>((i) => i.children ?? [i]))
      .map(destination)
      .sort();
    const after = areas
      .flatMap((g) => g.items)
      .map(destination)
      .sort();
    expect(after).toEqual(before);
    expect(
      areas
        .find((area) => area.title === "Financeiro")
        ?.items.filter((item) => item.to === "/relatorios/financeiros"),
    ).toHaveLength(1);
  });
  it("conserva relatórios quando a respectiva área não está autorizada", () => {
    const allowed = groups.filter((group) => group.title !== "Financeiro");
    expect(
      getNavigationAreas(allowed)
        .find((group) => group.title === "Relatórios")
        ?.items.map((item) => item.to),
    ).toEqual(["/relatorios/financeiros"]);
  });
  it.each(["Aluno", "Encarregado", "Professor"])(
    "organiza as áreas do %s sem perder destinos ou parâmetros",
    (role) => {
      const catalogue = getPortalNavigation(role as "Aluno" | "Encarregado" | "Professor");
      const areas = getNavigationAreas(catalogue);
      const serialize = (item: { to?: string; search?: unknown }) =>
        JSON.stringify([item.to, item.search]);
      const original = catalogue.flatMap((group) =>
        group.items.flatMap<NavItem>((item) => item.children ?? [item]),
      );
      expect(
        areas
          .flatMap((area) => area.items)
          .map(serialize)
          .sort(),
      ).toEqual(original.map(serialize).sort());
      expect(areas.some((area) => area.title.startsWith("Portal do"))).toBe(false);
      expect(areas.find((area) => area.title === "Académico")).toEqual(
        getNavigationContext(catalogue, "/pedagogica", { tab: "notas" }),
      );
    },
  );
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
    // A entrada mais específica ganha ao pai: estando no catálogo, não é a
    // Pedagógica que se acende.
    expect(
      isContextDestinationActive({ to: "/pedagogica" }, groups, "/pedagogica/catalogo", {}),
    ).toBe(false);
  });

  it("acende o pai quando o módulo adormecido já não tem entrada própria", () => {
    // O RH saiu do menu (módulo adormecido). Sem entrada própria para
    // /financeiro/rh, quem lá chegar por URL vê o Financeiro assinalado — que é
    // o pai mais próximo que existe. Antes esta asserção era `false`, porque o
    // RH tinha as suas cinco entradas.
    expect(
      isContextDestinationActive({ to: "/financeiro" }, groups, "/financeiro/rh/folha", {}),
    ).toBe(true);
  });
});
