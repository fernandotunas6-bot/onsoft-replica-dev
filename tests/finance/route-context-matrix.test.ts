import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

/**
 * Guarda da lei visual «UMA PÁGINA = UMA FINALIDADE» nas rotas financeiras.
 *
 * Lê o código-fonte das rotas e verifica a matriz de pertença documentada em
 * `docs/specs/finance/FINANCE_ROUTE_CONTEXT_MATRIX.md`: cada página só pode
 * montar as ferramentas do seu próprio módulo e só pode apresentar as acções
 * da sua finalidade. Navegar para páginas vizinhas é permitido; apresentar o
 * conteúdo dessas páginas não é.
 *
 * É um teste estático sobre a fonte, não sobre o render: apanha a reintrodução
 * de um painel ou de um atalho fora de contexto na revisão, antes de chegar à
 * escola. Não substitui os testes de render em `tests/routes/`.
 */

const root = resolve(import.meta.dirname, "../..");

function source(routeFile: string): string {
  return readFileSync(resolve(root, "src/routes", routeFile), "utf-8");
}

describe("matriz de contexto das rotas financeiras", () => {
  it("a tesouraria monta apenas as ferramentas do módulo financeiro", () => {
    const s = source("financeiro.tsx");
    expect(s).toContain('<InstalledModuleTools module="financeiro" />');
    // As ferramentas instaladas de facturação pertencem a /faturas.
    expect(s).not.toContain('<InstalledModuleTools module="faturas" />');
  });

  it("a tesouraria não apresenta acções de folha salarial", () => {
    const s = source("financeiro.tsx");
    // Salários têm a sua própria área; a navegação institucional continua a
    // levar lá a partir do menu Financeiro.
    expect(s).not.toContain('<Link to="/financeiro/rh">');
  });

  it("as facturas pertencem ao grupo Financeiro, não a Relatórios", () => {
    const s = source("faturas.tsx");
    expect(s).toMatch(/group="Financeiro"\s*\n\s*title="Faturas"/);
    expect(s).not.toMatch(/group="Relatórios"\s*\n\s*title="Faturas"/);
  });

  it("as facturas montam apenas as ferramentas do módulo de facturas", () => {
    const s = source("faturas.tsx");
    expect(s).toContain('<InstalledModuleTools module="faturas" />');
    expect(s).not.toContain('<InstalledModuleTools module="financeiro" />');
  });

  it("as facturas não importam pagamentos nem abrem o portal do pagador", () => {
    const s = source("faturas.tsx");
    // Importação de extractos e portal PayFlow são tesouraria: continuam em
    // /importar e em /financeiro, não no fluxo de emissão de documentos.
    expect(s).not.toContain('modulo: "pagamentos"');
    expect(s).not.toContain("getPayflowPayerUrl");
  });

  it("a folha salarial não emite QR de presença docente", () => {
    const s = source("financeiro.rh.tsx");
    expect(s).not.toContain("createTeacherLessonQr");
    expect(s).not.toContain("Presença docente por QR");
    expect(s).not.toContain('from "qrcode"');
  });

  it("a assiduidade docente emite o QR de presença na sua própria página", () => {
    const s = source("financeiro.rh.aulas.tsx");
    expect(s).toContain("createTeacherLessonQr");
    expect(s).toContain("Presença docente por QR");
    // Presença não é pagamento: nenhuma liquidação ou factura nesta página.
    expect(s).not.toContain("listHrPayrollRuns");
    expect(s).not.toContain("invoice");
  });

  it("a assiduidade docente não apresenta totais de folha salarial", () => {
    const s = source("financeiro.rh.aulas.tsx");
    expect(s).not.toContain("StatGrid");
    expect(s).not.toContain("kwanza");
  });
});
