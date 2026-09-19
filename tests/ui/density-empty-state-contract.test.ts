import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { densityPresets, type UiDensity } from "@/lib/appearance";

const root = resolve(import.meta.dirname, "../..");

describe("ui density", () => {
  it("exposes three presets with labels in Portuguese", () => {
    expect(densityPresets.map((p) => p.id)).toEqual([
      "compact",
      "comfortable",
      "spacious",
    ] satisfies UiDensity[]);
    expect(densityPresets.every((p) => p.label.length > 0 && p.hint.length > 0)).toBe(true);
  });

  it("defines CSS variables for each density on html[data-density]", () => {
    const css = readFileSync(resolve(root, "src/styles.css"), "utf8");
    for (const id of ["compact", "comfortable", "spacious"] as const) {
      expect(css).toContain(`html[data-density="${id}"]`);
    }
    expect(css).toContain("--siga-row-py");
    expect(css).toContain("--siga-card-pad");
  });

  it("applies density to the document root in applyAppearance", () => {
    const source = readFileSync(resolve(root, "src/lib/appearance.tsx"), "utf8");
    expect(source).toContain('root.dataset["density"]');
    expect(source).toContain('density: "comfortable"');
  });
});

describe("EmptyState rollout", () => {
  it("ships the shared EmptyState component", () => {
    const source = readFileSync(resolve(root, "src/components/ui/empty-state.tsx"), "utf8");
    expect(source).toContain("export function EmptyState");
    expect(source).toContain("actionLabel");
    expect(source).toContain('role="status"');
  });

  it("uses EmptyState on the rolled-out routes (core, financeiro e RH)", () => {
    const routes = [
      "src/routes/calendario.tsx",
      "src/routes/comunicacoes.tsx",
      "src/routes/documentos.tsx",
      "src/routes/pessoas/index.tsx",
      "src/routes/alunos/index.tsx",
      "src/routes/financeiro.tsx",
      "src/routes/faturas.tsx",
      "src/routes/planos-aula.tsx",
      "src/routes/acessos.tsx",
      "src/routes/financeiro.rh.tsx",
      "src/routes/financeiro.rh.folha.tsx",
      "src/routes/financeiro.rh.faltas.tsx",
      "src/routes/financeiro.rh.pagamentos.tsx",
      "src/routes/financeiro.rh.presenca.tsx",
    ];
    for (const file of routes) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, file).toContain('from "@/components/ui/empty-state"');
      expect(source, file).toContain("<EmptyState");
    }
  });

  it("drops the ad-hoc empty blocks in the RH operational routes", () => {
    const legacy: Array<[string, string]> = [
      ["src/routes/financeiro.rh.folha.tsx", "Ainda não existem folhas salariais."],
      ["src/routes/financeiro.rh.faltas.tsx", "Nenhuma falta neste estado."],
      ["src/routes/financeiro.rh.pagamentos.tsx", "Ainda não existem ordens salariais."],
      ["src/routes/financeiro.rh.presenca.tsx", "Ainda não existem evidências registadas."],
    ];
    for (const [file, phrase] of legacy) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, file).not.toContain(`<p className="text-sm text-muted-foreground">${phrase}`);
    }
  });
});
