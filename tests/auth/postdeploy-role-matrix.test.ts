import { describe, expect, it } from "vitest";
import {
  canAccessPath,
  type ApplicationRole,
  type ModuleGrantMap,
} from "@/features/auth/access-policy";
import { getNavigationContext } from "@/features/auth/contextual-navigation";
import { getPortalNavigation, type NavGroup } from "@/features/auth/portal-engine";

function links(groups: NavGroup[]) {
  return groups.flatMap((group) =>
    group.items.flatMap((item) => item.children ?? (item.to ? [item] : [])),
  );
}

/**
 * Teste estrutural sem contas nem dados reais. O servidor continua a ser
 * responsável por autorizar cada operação. QA E2E com sessão só em staging.
 */
describe("auditoria pós-publicação — papéis e menus autorizados", () => {
  const roles: ApplicationRole[] = [
    "Administrador",
    "Secretaria",
    "Tesouraria",
    "Professor",
    "Encarregado",
    "Aluno",
    "Utilizador",
  ];

  it.each(roles)("%s não apresenta destinos proibidos pela política local", (role) => {
    const nav = getPortalNavigation(role);
    for (const link of links(nav)) {
      expect(canAccessPath(link.to, role), `${role}: ${link.to}`).toBe(true);
    }
  });

  it("aluno e encarregado não ganham áreas administrativas com grants indevidos", () => {
    const attemptedGrant: ModuleGrantMap = {
      gestao: "Total",
      pessoas: "Total",
      financeiro: "Total",
      importacao: "Total",
    };
    const forbidden = ["/acessos", "/configuracoes", "/importar", "/financeiro/rh"];
    for (const role of ["Aluno", "Encarregado"] as const) {
      const nav = getPortalNavigation(role, attemptedGrant);
      const destinations = links(nav).map((link) => link.to);
      for (const route of forbidden) {
        expect(canAccessPath(route, role, attemptedGrant)).toBe(false);
        expect(destinations).not.toContain(route);
        expect(getNavigationContext(nav, route)).toBeNull();
      }
    }
  });

  it("professor só acede ao financeiro se o grant permitido for concedido", () => {
    expect(canAccessPath("/financeiro", "Professor")).toBe(false);
    expect(getNavigationContext(getPortalNavigation("Professor"), "/financeiro")).toBeNull();
    const grants: ModuleGrantMap = { financeiro: "Leitura" };
    expect(canAccessPath("/financeiro", "Professor", grants)).toBe(true);
    expect(canAccessPath("/financeiro/rh", "Professor", grants)).toBe(false);
    for (const link of links(getPortalNavigation("Professor", grants))) {
      expect(canAccessPath(link.to, "Professor", grants)).toBe(true);
    }
  });

  it("contexto não inventa um módulo fora do catálogo do perfil", () => {
    for (const role of ["Administrador", "Professor", "Aluno"] as const) {
      const navigation = getPortalNavigation(role);
      const withoutFinance = navigation.filter((group) => group.title !== "Financeiro");
      if (!links(withoutFinance).some((link) => link.to === "/faturas")) {
        expect(getNavigationContext(withoutFinance, "/faturas")).toBeNull();
      }
    }
  });
});
