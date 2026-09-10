import { describe, it, expect } from "vitest";
import {
  resolvePortalMode,
  getPortalNavigation,
  getPortalContextualSuggestions,
  isNavChildActive,
} from "@/features/auth/portal-engine";

describe("Smart Portal Engine", () => {
  it("resolves portal modes correctly for each role", () => {
    expect(resolvePortalMode("Aluno")).toBe("student");
    expect(resolvePortalMode("Encarregado")).toBe("guardian");
    expect(resolvePortalMode("Professor")).toBe("teacher");
    expect(resolvePortalMode("Administrador")).toBe("admin");
    expect(resolvePortalMode("Secretaria")).toBe("admin");
    expect(resolvePortalMode("Tesouraria")).toBe("admin");
  });

  it("generates student portal navigation without admin routes", () => {
    const nav = getPortalNavigation("Aluno");
    expect(nav).toHaveLength(1);
    expect(nav[0]?.title).toBe("Portal do Aluno");

    const items = nav[0]?.items ?? [];
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Início");
    expect(labels).toContain("Académico");
    expect(labels).toContain("Calendário Lectivo");
    expect(labels).toContain("Frequência");
    expect(labels).toContain("Financeiro");
    expect(labels).toContain("Documentos");
    expect(labels).toContain("Comunicação");
    expect(labels).toContain("Meu Perfil");

    expect(labels).not.toContain("Importação de Dados");
    expect(labels).not.toContain("Gestão de Acessos");
  });

  it("generates guardian portal navigation focused on student tracking", () => {
    const nav = getPortalNavigation("Encarregado");
    expect(nav).toHaveLength(1);
    expect(nav[0]?.title).toBe("Portal do Encarregado");

    const items = nav[0]?.items ?? [];
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Meu Educando");
    expect(labels).toContain("Desempenho");
    expect(labels).toContain("Calendário Lectivo");
    expect(labels).toContain("Frequência");
    expect(labels).toContain("Financeiro");
  });

  it("generates teacher portal navigation focused on teaching and attendance", () => {
    const nav = getPortalNavigation("Professor");
    expect(nav).toHaveLength(1);
    expect(nav[0]?.title).toBe("Portal do Professor");

    const items = nav[0]?.items ?? [];
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Início");
    expect(labels).toContain("Frequência");
    expect(labels).toContain("Ensino e Avaliações");
    expect(labels).toContain("Calendário Lectivo");
  });

  it("elevates Início and Calendário into Principal for admin staff", () => {
    const nav = getPortalNavigation("Administrador");
    expect(nav[0]?.title).toBe("Principal");
    const principalLabels = (nav[0]?.items ?? []).map((i) => i.label);
    expect(principalLabels).toEqual(["Início", "Calendário Lectivo"]);
    expect(nav.some((g) => g.title === "Académico")).toBe(true);
  });

  it("returns contextual suggestions for each portal mode", () => {
    const teacherSugg = getPortalContextualSuggestions("Professor");
    expect(teacherSugg.some((s) => s.label === "Fazer chamada")).toBe(true);

    const studentSugg = getPortalContextualSuggestions("Aluno");
    expect(studentSugg.some((s) => s.label === "Notas e Boletim")).toBe(true);

    const guardianSugg = getPortalContextualSuggestions("Encarregado");
    expect(guardianSugg.some((s) => s.label === "Faltas e Presenças")).toBe(true);
  });
});

/**
 * Regressão do realce múltiplo na barra lateral.
 *
 * "Área Pedagógica" tem cinco sub-itens e quatro deles apontam para o MESMO
 * caminho (`/pedagogica`), distinguindo-se apenas pelo `?tab=`. O estado activo
 * comparava só `child.to === pathname`, por isso em `/pedagogica` os quatro
 * acendiam ao mesmo tempo e a barra deixava de dizer em que separador se está —
 * bem visível no telemóvel, onde a barra ocupa o ecrã todo.
 */
describe("isNavChildActive", () => {
  const pedagogicaChildren = [
    { to: "/pedagogica", search: { tab: "turmas" } },
    { to: "/pedagogica", search: { tab: "notas" } },
    { to: "/pedagogica", search: { tab: "horarios" } },
    { to: "/pedagogica", search: { tab: "chamada" } },
    { to: "/planos-aula" },
  ];

  it("acende um único separador de /pedagogica de cada vez", () => {
    const activos = pedagogicaChildren.filter((child) =>
      isNavChildActive(child, "/pedagogica", { tab: "horarios" }),
    );
    expect(activos).toEqual([{ to: "/pedagogica", search: { tab: "horarios" } }]);
  });

  it("não acende nenhum separador quando o URL não fixa a aba", () => {
    const activos = pedagogicaChildren.filter((child) =>
      isNavChildActive(child, "/pedagogica", {}),
    );
    expect(activos).toEqual([]);
  });

  it("continua a distinguir sub-itens por caminho", () => {
    expect(isNavChildActive({ to: "/planos-aula" }, "/planos-aula", {})).toBe(true);
    expect(isNavChildActive({ to: "/planos-aula" }, "/pedagogica", {})).toBe(false);
  });

  it("ignora chaves de pesquisa indefinidas em vez de as exigir no URL", () => {
    expect(
      isNavChildActive(
        { to: "/pedagogica", search: { tab: "notas", turma: undefined } },
        "/pedagogica",
        { tab: "notas" },
      ),
    ).toBe(true);
  });

  it("exige todas as chaves definidas, não só a primeira", () => {
    const child = { to: "/pedagogica", search: { tab: "notas", turma: "t-1" } };
    expect(isNavChildActive(child, "/pedagogica", { tab: "notas" })).toBe(false);
    expect(isNavChildActive(child, "/pedagogica", { tab: "notas", turma: "t-1" })).toBe(true);
  });
});
