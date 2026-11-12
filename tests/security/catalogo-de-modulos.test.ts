import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODULE_CATALOG } from "@/features/auth/module-availability";

/**
 * O catálogo existe em dois lados: no `scripts/siga/modules.json`, que o código
 * lê, e na tabela `module_catalog`, a que o `school_modules` se liga por chave
 * estrangeira. Se divergirem, uma escola não consegue ligar um módulo que o
 * produto tem — a linha é recusada pela chave.
 *
 * Foi essa deriva que matou a primeira versão deste mecanismo: o `module_catalog`
 * ficou com os oito códigos grosseiros de Agosto (`academic`, `assessment`,
 * `attendance`, …), cujos manifestos declaravam sete rotas que não existem, e
 * nada no `src/` o lia porque não havia nada de útil a ler.
 *
 * Este teste lê a migração em vez da base — não precisa de credenciais nem de
 * rede, e corre em qualquer máquina.
 */

const MIGRACAO = resolve(
  __dirname,
  "../../supabase/migrations/20261025120000_module_catalog_vocabulario_actual.sql",
);

function codigosDaMigracao(): string[] {
  const sql = readFileSync(MIGRACAO, "utf8");
  const insert = sql.slice(sql.indexOf("insert into public.module_catalog"));
  return [...insert.matchAll(/^\s*\('([^']+)',/gm)].map((m) => m[1]);
}

describe("catálogo de módulos", () => {
  it("a migração declara exactamente os módulos do modules.json", () => {
    expect(codigosDaMigracao().sort()).toEqual(MODULE_CATALOG.map((mod) => mod.id).sort());
  });

  it("não há códigos repetidos", () => {
    const codigos = codigosDaMigracao();
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("limpa as linhas por escola antes do catálogo, pela chave estrangeira", () => {
    const sql = readFileSync(MIGRACAO, "utf8");
    const iEscolas = sql.indexOf("delete from public.school_modules");
    const iCatalogo = sql.indexOf("delete from public.module_catalog");
    expect(iEscolas).toBeGreaterThan(-1);
    expect(iCatalogo).toBeGreaterThan(iEscolas);
  });

  it("corre numa transacção", () => {
    const sql = readFileSync(MIGRACAO, "utf8");
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
  });

  it("o manifesto de cada módulo é JSON válido e descreve o caminho certo", () => {
    const sql = readFileSync(MIGRACAO, "utf8");
    const porId = new Map(MODULE_CATALOG.map((mod) => [mod.id, mod]));
    const linhas = [
      ...sql.matchAll(/^\s*\('([^']+)', '(?:[^']|'')*', '[^']*', \w+, '(.+)'::jsonb\)/gm),
    ];
    expect(linhas.length).toBe(MODULE_CATALOG.length);
    for (const [, code, cru] of linhas) {
      const manifesto = JSON.parse(cru.replace(/''/g, "'")) as {
        navPath: string | null;
        skill: string | null;
        defaultEnabled: boolean;
      };
      const mod = porId.get(code);
      expect(mod, `${code} não está no catálogo do código`).toBeTruthy();
      expect(manifesto.navPath, `${code}: navPath`).toBe(mod!.navPath);
      expect(manifesto.skill, `${code}: skill`).toBe(mod!.launcherId);
      // `defaultEnabled` é o inverso de `dormant` — é o que o servidor usaria se
      // algum dia lesse a omissão da base em vez do ficheiro.
      expect(manifesto.defaultEnabled, `${code}: defaultEnabled`).toBe(!mod!.dormant);
    }
  });

  it("nenhum código do vocabulário de Agosto sobrevive", () => {
    const antigos = [
      "assessment",
      "attendance",
      "communication",
      "identity",
      "reports",
      "academic",
      "finance",
      "documents",
    ];
    const actuais = new Set(codigosDaMigracao());
    // `documents` e `finance` são os únicos nomes que por acaso se parecem com os
    // actuais (`documentos`, `financeiro`), e nem esses coincidem.
    for (const codigo of antigos) {
      expect(actuais.has(codigo), `${codigo} é vocabulário de Agosto`).toBe(false);
    }
  });
});
