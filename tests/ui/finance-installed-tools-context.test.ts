import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cada página financeira mostra só as funções instaladas do seu módulo. As duas
 * pediam também as da vizinha: Caixa mostrava NIF, AGT e e-mail de fatura, e
 * Facturas mostrava referências e carteira de tesouraria.
 */
const PAGINAS: Array<[file: string, module: string]> = [
  ["financeiro.tsx", "financeiro"],
  ["faturas.tsx", "faturas"],
];

function modulosPedidos(file: string): string[] {
  const source = readFileSync(join(process.cwd(), "src/routes", file), "utf8");
  return [...source.matchAll(/<InstalledModuleTools\s+module="([^"]+)"/g)].map((m) => m[1]);
}

describe("funções instaladas por página financeira", () => {
  it.each(PAGINAS)("%s pede apenas o módulo %s", (file, module) => {
    expect(modulosPedidos(file)).toEqual([module]);
  });

  it("Relatórios não mostra funções instaladas nem a linha AGT inventada", () => {
    expect(modulosPedidos("relatorios.financeiros.tsx")).toEqual([]);
    const source = readFileSync(
      join(process.cwd(), "src/routes/relatorios.financeiros.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/`AGT;/);
  });

  it("Facturas não atalha para importação nem conciliação de pagamentos", () => {
    const source = readFileSync(join(process.cwd(), "src/routes/faturas.tsx"), "utf8");
    expect(source).not.toMatch(/PayflowAdminLaunchButton|getPayflowPayerUrl|to="\/importar"/);
  });
});
