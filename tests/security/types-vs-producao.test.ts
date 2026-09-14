import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Os tipos gerados e a produção têm de descrever a mesma base.
 *
 * Até 2026-09-14 não descreviam: `src/integrations/supabase/types.ts` era
 * mantido à mão com 40 tabelas, a produção tinha 149, e o ficheiro declarava
 * ainda 17 tabelas que **não existem** — `invoices`, `payments`, `courses`,
 * `class_schedule_slots`, `term_grades` e outras. Cobertura de tipos para
 * código que falha em execução é pior do que nenhuma: foi assim que cinco
 * importadores ficaram a escrever para um modelo de dados substituído sem que
 * nada objectasse.
 *
 * Este teste compara o ficheiro de tipos com `supabase/PRODUCTION_SNAPSHOT.json`
 * (`npm run siga:db-snapshot`). Falha nos dois sentidos, e é de propósito:
 *
 *   · tabela na base e não nos tipos → alguém aplicou migração e não regenerou
 *   · tabela nos tipos e não na base → os tipos prometem o que não existe
 */

const REPO = resolve(__dirname, "../..");

function tabelasDosTipos(): Set<string> {
  const código = readFileSync(resolve(REPO, "src/integrations/supabase/types.ts"), "utf8");
  const início = código.indexOf("\n  public: {");
  const tabelas = código.indexOf("Tables: {", início);
  const views = código.indexOf("\n    Views: {", tabelas);
  const bloco = código.slice(tabelas, views);
  return new Set([...bloco.matchAll(/\n {6}([A-Za-z_][A-Za-z0-9_]*): \{/g)].map((m) => m[1]));
}

type Retrato = { tabelas: { tabela: string }[]; capturadoEm: string };

function tabelasDoRetrato(): Set<string> {
  const retrato = JSON.parse(
    readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
  ) as Retrato;
  return new Set(retrato.tabelas.map((t) => t.tabela));
}

const tipos = tabelasDosTipos();
const produção = tabelasDoRetrato();

describe("tipos gerados vs produção", () => {
  it("o ficheiro de tipos descreve o esquema inteiro, não uma fatia", () => {
    // Era 40 quando a base tinha 149. Um limiar alto aqui impede o regresso a
    // um ficheiro mantido à mão com um subconjunto.
    expect(tipos.size).toBeGreaterThanOrEqual(140);
  });

  it("nenhuma tabela da produção fica sem tipos", () => {
    const semTipos = [...produção].filter((t) => !tipos.has(t)).sort();
    expect(
      semTipos,
      `Estas tabelas existem na base e não estão nos tipos: ${semTipos.join(", ")}. ` +
        `Depois de aplicar uma migração, regenerar: ` +
        `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts ` +
        `(e npm run siga:db-snapshot para o retrato).`,
    ).toEqual([]);
  });

  it("os tipos não prometem tabelas que a base não tem", () => {
    const inventadas = [...tipos].filter((t) => !produção.has(t)).sort();
    expect(
      inventadas,
      `Os tipos declaram tabelas que não existem na produção: ${inventadas.join(", ")}. ` +
        `Isso dá cobertura de tipos a código que falha em execução — foi o que ` +
        `aconteceu com invoices, payments, courses e class_schedule_slots.`,
    ).toEqual([]);
  });

  it("o ficheiro diz que é gerado", () => {
    // Sem esta marca, alguém volta a editá-lo à mão e a divergência recomeça.
    const cabeçalho = readFileSync(
      resolve(REPO, "src/integrations/supabase/types.ts"),
      "utf8",
    ).slice(0, 400);
    expect(cabeçalho).toMatch(/gerados|não editar à mão/i);
  });
});
