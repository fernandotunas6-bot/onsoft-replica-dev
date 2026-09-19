import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Um trigger `BEFORE UPDATE` que escreve `NEW.<coluna>` exige que a coluna exista. Se não
 * existir, o Postgres levanta 42703 **em cada UPDATE** da tabela — e só no UPDATE: o
 * INSERT passa, a tabela parece funcionar, e a falha aparece ao primeiro utilizador que
 * tenta alterar alguma coisa.
 *
 * Isto não é hipotético. Aconteceu a 2026-09-16 com as duas tabelas de `features/contacts`,
 * que nasceram com `set_updated_at_and_version()` por ser o padrão da casa — sem reparar
 * que a função também faz `NEW.created_by = OLD.created_by` e
 * `NEW.updated_by = …`. Só apareceu ao exercitar um UPDATE contra a base; nenhum teste do
 * repositório o via, porque o SQL parseia e a produção aceita o `CREATE TRIGGER` sem
 * queixa. A mesma sonda encontrou duas tabelas `hr_*` já partidas há meses.
 *
 * Mede contra o retrato (`npm run siga:db-snapshot`), que traz as colunas reais de cada
 * tabela e a função de cada trigger.
 */

const REPO = resolve(__dirname, "../..");
const SNAPSHOT = resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json");

type Snapshot = {
  tabelas: Array<{ tabela: string; colunas: string[] }>;
  funcoes: Array<{ schema: string; funcao: string }>;
  triggers: Array<{ tabela: string; trigger: string; funcao: string }>;
};

const snap: Snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));

/**
 * As colunas que cada função de trigger escreve em `NEW`, lidas do corpo real da função em
 * produção a 2026-09-16. Acrescentar aqui uma função nova sempre que ela escrever colunas.
 *
 *   · `set_updated_at_and_version`  — created_by, updated_by, updated_at, version
 *   · `siga_touch_updated_at_and_version` — updated_at, version (a variante sem autoria,
 *     criada em `20260916130000_…` para tabelas que não registam quem alterou)
 *   · `siga_touch_updated_at` — updated_at
 */
const COLUNAS_EXIGIDAS: Record<string, string[]> = {
  set_updated_at_and_version: ["created_by", "updated_by", "updated_at", "version"],
  siga_touch_updated_at_and_version: ["updated_at", "version"],
  siga_touch_updated_at: ["updated_at"],
};

/**
 * Tabelas em produção cujo trigger exige colunas que a tabela não tem. Cada UPDATE nelas
 * falha com 42703 — não é dívida cosmética, é a tabela inteira sem caminho de escrita.
 *
 * As duas são anteriores a este teste e estão ambas vazias, que é porque ninguém deu por
 * elas. A correcção é uma linha (apontar o trigger a
 * `siga_touch_updated_at_and_version`, que não exige autoria) mas é escrita na base em
 * tabelas de RH — decisão do dono, não do agente. Esta lista existe para encolher.
 */
const TRIGGER_PARTIDO_CONHECIDO = new Set([
  "hr_attendance_assurance_policies.hr_attendance_assurance_policies_set_updated_at",
  "hr_payment_settings.hr_payment_settings_set_updated_at",
]);

const colunasPorTabela = new Map(snap.tabelas.map((t) => [t.tabela, new Set(t.colunas)]));

/** Triggers do retrato cuja função escreve colunas — os únicos que este teste pode julgar. */
const triggersJulgaveis = snap.triggers.filter((t) => COLUNAS_EXIGIDAS[t.funcao]);

function emFalta(t: { tabela: string; funcao: string }): string[] {
  const colunas = colunasPorTabela.get(t.tabela);
  if (!colunas) return [];
  return COLUNAS_EXIGIDAS[t.funcao].filter((c) => !colunas.has(c));
}

describe("triggers vs colunas que eles escrevem", () => {
  it("o retrato traz triggers e colunas para comparar", () => {
    expect(
      triggersJulgaveis.length,
      "nenhum trigger conhecido no retrato — corra npm run siga:db-snapshot",
    ).toBeGreaterThan(20);
    expect(colunasPorTabela.size).toBeGreaterThan(100);
  });

  it("as funções de trigger que este teste conhece ainda existem", () => {
    // Se uma for renomeada, o teste continuava verde sem julgar nada.
    const nomes = new Set(snap.funcoes.map((f) => f.funcao));
    for (const funcao of Object.keys(COLUNAS_EXIGIDAS)) {
      expect(nomes.has(funcao), `função de trigger ${funcao} ausente da produção`).toBe(true);
    }
  });

  it("nenhum trigger escreve coluna que a tabela não tem", () => {
    const partidos = triggersJulgaveis
      .map((t) => ({ chave: `${t.tabela}.${t.trigger}`, falta: emFalta(t) }))
      .filter((r) => r.falta.length > 0 && !TRIGGER_PARTIDO_CONHECIDO.has(r.chave))
      .map((r) => `${r.chave} → falta ${r.falta.join(", ")}`)
      .sort();

    expect(
      partidos,
      `Estes triggers escrevem colunas que a tabela não tem: ${partidos.join("; ")}. ` +
        `Cada UPDATE na tabela falha com 42703, e só o UPDATE — o INSERT passa, por isso ` +
        `a tabela parece funcionar até alguém tentar alterar uma linha. Aponte o trigger ` +
        `a uma função que corresponda às colunas da tabela.`,
    ).toEqual([]);
  });

  it("a lista de triggers partidos não tem entradas obsoletas", () => {
    const chaves = new Set(triggersJulgaveis.map((t) => `${t.tabela}.${t.trigger}`));
    const resolvidos = [...TRIGGER_PARTIDO_CONHECIDO]
      .filter((chave) => {
        if (!chaves.has(chave)) return true;
        const t = triggersJulgaveis.find((x) => `${x.tabela}.${x.trigger}` === chave)!;
        return emFalta(t).length === 0;
      })
      .sort();

    expect(
      resolvidos,
      `entradas que já não descrevem uma falha real: ${resolvidos.join(", ")}. ` +
        `Retire-as — a lista existe para encolher até ficar vazia.`,
    ).toEqual([]);
  });
});
