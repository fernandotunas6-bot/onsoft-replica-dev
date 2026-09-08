import { describe, expect, it } from "vitest";
import { WORKSPACE_MODULE_SPECS } from "@/features/auth/navigation-catalog";
import { canAccessPath } from "@/features/auth/access-policy";

describe("command palette catalog contract", () => {
  it("exposes Início, Calendário and Alunos for Administrador", () => {
    const pages = WORKSPACE_MODULE_SPECS.filter((spec) =>
      canAccessPath(spec.navPath, "Administrador"),
    );
    const labels = pages.map((page) => page.name);
    expect(labels).toContain("Início");
    expect(labels).toContain("Calendário");
    expect(labels).toContain("Alunos");
  });

  it("hides finance pages from Professor", () => {
    const pages = WORKSPACE_MODULE_SPECS.filter((spec) =>
      canAccessPath(spec.navPath, "Professor"),
    );
    expect(pages.some((page) => page.navPath === "/financeiro")).toBe(false);
    expect(pages.some((page) => page.navPath === "/calendario")).toBe(true);
  });
});

describe("term label helper contract", () => {
  it("prefers named terms and falls back to sequence", () => {
    const named = { name: "1.º Trimestre", sequence: 1 };
    const unnamed = { name: "", sequence: 2 };
    const format = (term: { name: string; sequence: number }) => {
      const name = term.name?.trim();
      if (name) return name;
      if (term.sequence > 0) return `${term.sequence}.º Período`;
      return "Período";
    };
    expect(format(named)).toBe("1.º Trimestre");
    expect(format(unnamed)).toBe("2.º Período");
  });
});
