import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contracto estático do catálogo: a apresentação das categorias é validada
 * funcionalmente nos testes de StackedModal. Aqui impede-se que painéis
 * existentes fiquem órfãos por falta de uma ligação na árvore.
 */
const settingsSource = readFileSync(
  new URL("../../src/components/modals/SettingsCenter.tsx", import.meta.url),
  "utf8",
);
const ids = [...settingsSource.matchAll(/^\s+id: "([^"]+)",/gm)].map((match) => match[1]);
const targets = [...settingsSource.matchAll(/^\s+to: "([^"]+)",/gm)].map((match) => match[1]);
const rootRows = settingsSource.match(/id: "root",[\s\S]*?rows: \[([\s\S]*?)\n        \],/);
const rootTargets = [...(rootRows?.[1] ?? "").matchAll(/to: "([^"]+)"/g)].map(
  (match) => match[1],
);

describe("acessibilidade das categorias já existentes em Definições", () => {
  it("mantém Identidade Digital e Pedagógico acessíveis na navegação principal", () => {
    expect(rootRows).not.toBeNull();
    expect(rootTargets).toContain("identidade");
    expect(rootTargets).toContain("pedagogico");
  });

  it("todos os destinos levam a painéis registados, sem IDs duplicados", () => {
    expect(new Set(ids).size).toBe(ids.length);
    const existing = new Set(ids);
    for (const target of targets) {
      expect(existing.has(target), `Destino inexistente: ${target}`).toBe(true);
    }
  });

  it("não deixa painéis registados sem acesso por uma ligação existente", () => {
    const reachable = new Set(targets);
    for (const id of ids) {
      if (id === "root") continue;
      expect(reachable.has(id), `Painel sem acesso: ${id}`).toBe(true);
    }
  });
});
