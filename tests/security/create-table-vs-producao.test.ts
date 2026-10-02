import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `CREATE TABLE IF NOT EXISTS` sobre uma tabela que já existe com outra forma.
 *
 * Não faz nada, e não devolve erro. Quem aplica vê sucesso e conclui que ficou
 * feito. É a falha mais silenciosa que este repositório já produziu, porque não
 * deixa rasto em lado nenhum: não há erro no SQL Editor, não há coluna nova, não
 * há aviso.
 *
 * Aconteceu com `school_access_requests`. Uma versão da tabela foi aplicada à mão
 * a 2026-09-25. A migração `20260925090000_school_access_requests.sql` foi depois
 * reescrita com outros nomes — `institutional_number` por `institutional_id`,
 * `requested_profile` por `requested_role`, `matched_person_id` por `person_id` —
 * e mais sete colunas. Correu. A tabela ficou exactamente como estava, e o pedido
 * de acesso a uma escola nunca gravou nada.
 *
 * O único rasto eram os índices: a produção ficou com seis onde devia ter três.
 * Os da migração nova criaram-se — só tocam colunas que as duas versões
 * partilham — e os da versão antiga não foram largados. Ninguém olha para a lista
 * de índices de uma tabela que «foi aplicada com sucesso».
 *
 * Este teste compara o que cada `CREATE TABLE` declara com o que a produção tem.
 * Uma coluna declarada que a produção não tem só é aceitável se alguma migração a
 * acrescentar por `ALTER TABLE` — `ADD COLUMN` ou `RENAME … TO`. Sem isso, o
 * `CREATE` é uma promessa que a base não vai cumprir.
 *
 * Tabelas que a produção ainda não tem ficam de fora: aí o `CREATE` corre de
 * verdade, e é `production-snapshot.test.ts` que trata delas.
 */

const REPO = resolve(__dirname, "../..");
const MIGRACOES = resolve(REPO, "supabase/migrations");

type Retrato = { tabelas: Array<{ tabela: string; colunas: string[] }> };

const retrato: Retrato = JSON.parse(
  readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
);
const colunasEmProducao = new Map(retrato.tabelas.map((t) => [t.tabela, new Set(t.colunas)]));

const ficheiros = readdirSync(MIGRACOES)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const NAO_E_COLUNA = new Set([
  "constraint",
  "primary",
  "unique",
  "check",
  "foreign",
  "exclude",
  "like",
]);

/**
 * Colunas de um corpo de `CREATE TABLE`: parte nas vírgulas de topo (as de dentro de
 * parêntesis — `numeric(16,2)`, `check(a in (…))`, `unique(a,b)` — não contam) e fica
 * com o primeiro identificador de cada elemento que não seja uma restrição.
 *
 * A versão anterior exigia uma linha por coluna, com dois espaços de indentação e um
 * tipo de uma lista fixa. Não lia as migrações compactas de 24/09 (várias colunas por
 * linha, um espaço de indentação): devolvia `[]`, e a comparação entre duas
 * declarações da mesma tabela falhava por o parser não ler, não por divergirem.
 */
function colunasDoCorpo(corpo: string): string[] {
  const limpo = corpo.replace(/--[^\n]*/g, "");
  const elementos: string[] = [];
  let profundidade = 0;
  let atual = "";
  for (const c of limpo) {
    if (c === "(") profundidade++;
    else if (c === ")") profundidade--;
    if (c === "," && profundidade === 0) {
      elementos.push(atual);
      atual = "";
    } else atual += c;
  }
  elementos.push(atual);

  const colunas: string[] = [];
  for (const el of elementos) {
    const m = /^\s*"?([a-z_][a-z_0-9]*)"?\s+\S/i.exec(el);
    if (m && !NAO_E_COLUNA.has(m[1].toLowerCase())) colunas.push(m[1]);
  }
  return colunas;
}

/** Colunas declaradas por cada `CREATE TABLE`, por tabela e por ficheiro. */
function declaracoes() {
  const saida: Array<{ ficheiro: string; tabela: string; colunas: string[] }> = [];
  for (const ficheiro of ficheiros) {
    const sql = readFileSync(resolve(MIGRACOES, ficheiro), "utf8");
    const re =
      /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?"?([a-z_][a-z_0-9]*)"?\s*\(([\s\S]*?)\n\);/gi;
    for (const m of sql.matchAll(re)) {
      const corpo = m[2];
      saida.push({ ficheiro, tabela: m[1], colunas: colunasDoCorpo(corpo) });
    }
  }
  return saida;
}

/** Colunas que alguma migração acrescenta ou renomeia — o caminho de reconciliação. */
function colunasReconciliadas(): Set<string> {
  const reconciliadas = new Set<string>();
  for (const ficheiro of ficheiros) {
    const sql = readFileSync(resolve(MIGRACOES, ficheiro), "utf8");

    // ALTER TABLE x ADD COLUMN [IF NOT EXISTS] y — uma instrução pode acrescentar
    // várias colunas separadas por vírgula, cada uma com o seu ADD COLUMN.
    for (const bloco of sql.matchAll(
      /ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?"?([a-z_][a-z_0-9]*)"?([\s\S]*?);/gi,
    )) {
      const tabela = bloco[1];
      for (const add of bloco[2].matchAll(
        /ADD COLUMN(?:\s+IF NOT EXISTS)?\s+"?([a-z_][a-z_0-9]*)"?/gi,
      )) {
        reconciliadas.add(`${tabela}.${add[1]}`);
      }
      for (const ren of bloco[2].matchAll(
        /RENAME COLUMN\s+"?[a-z_][a-z_0-9]*"?\s+TO\s+"?([a-z_][a-z_0-9]*)"?/gi,
      )) {
        reconciliadas.add(`${tabela}.${ren[1]}`);
      }
    }

    // Renomeações feitas por `format(...)` dentro de um bloco DO, como em
    // `20260927100000_reconcile_school_access_requests.sql`: o nome de destino
    // está numa lista de pares, não no texto do ALTER.
    if (/RENAME COLUMN %I TO %I/i.test(sql)) {
      const alvo = /ALTER TABLE public\.([a-z_][a-z_0-9]*) RENAME COLUMN %I TO %I/i.exec(sql);
      if (alvo) {
        for (const par of sql.matchAll(
          /\(\s*'[a-z_][a-z_0-9]*'(?:::text)?\s*,\s*'([a-z_][a-z_0-9]*)'(?:::text)?\s*\)/gi,
        )) {
          reconciliadas.add(`${alvo[1]}.${par[1]}`);
        }
      }
    }
  }
  return reconciliadas;
}

const declaradas = declaracoes();
const reconciliadas = colunasReconciliadas();

describe("CREATE TABLE vs. produção", () => {
  it("o retrato tem tabelas para comparar", () => {
    expect(
      colunasEmProducao.size,
      "o retrato não tem tabelas — corra npm run siga:db-snapshot",
    ).toBeGreaterThan(50);
  });

  it("encontra declarações de tabela nas migrações", () => {
    expect(
      declaradas.length,
      "nenhum CREATE TABLE encontrado — o padrão deixou de bater",
    ).toBeGreaterThan(20);
  });

  it("nenhum CREATE TABLE declara coluna que a produção não tem e ninguém acrescenta", () => {
    const promessasVazias: string[] = [];

    for (const { ficheiro, tabela, colunas } of declaradas) {
      const emProducao = colunasEmProducao.get(tabela);
      // Tabela que a produção ainda não tem: o CREATE corre de facto.
      // `production-snapshot.test.ts` é que trata dessas.
      if (!emProducao) continue;

      for (const coluna of colunas) {
        if (emProducao.has(coluna)) continue;
        if (reconciliadas.has(`${tabela}.${coluna}`)) continue;
        promessasVazias.push(`${ficheiro}: ${tabela}.${coluna}`);
      }
    }

    expect(
      promessasVazias,
      `Estes CREATE TABLE declaram colunas que a produção não tem, sobre tabelas que já ` +
        `existem: ${promessasVazias.join("; ")}. Um CREATE TABLE IF NOT EXISTS sobre uma ` +
        `tabela existente não faz nada e não dá erro — a coluna nunca aparece e quem ` +
        `aplicou fica convencido de que aplicou. Alterar uma tabela que já existe faz-se ` +
        `com ALTER TABLE: ver 20260927100000_reconcile_school_access_requests.sql.`,
    ).toEqual([]);
  });

  it("duas migrações que declaram a mesma tabela declaram-na igual", () => {
    const porTabela = new Map<string, Array<{ ficheiro: string; colunas: Set<string> }>>();
    for (const { ficheiro, tabela, colunas } of declaradas) {
      if (!porTabela.has(tabela)) porTabela.set(tabela, []);
      porTabela.get(tabela)!.push({ ficheiro, colunas: new Set(colunas) });
    }

    const divergentes: string[] = [];
    for (const [tabela, versoes] of porTabela) {
      if (versoes.length < 2) continue;
      const [primeira, ...restantes] = versoes;
      for (const outra of restantes) {
        const soNuma = [...primeira.colunas].filter((c) => !outra.colunas.has(c));
        const soNoutra = [...outra.colunas].filter((c) => !primeira.colunas.has(c));
        if (soNuma.length || soNoutra.length) {
          divergentes.push(
            `${tabela}: ${primeira.ficheiro} tem [${soNuma.join(", ")}] que ` +
              `${outra.ficheiro} não tem, e este tem [${soNoutra.join(", ")}]`,
          );
        }
      }
    }

    expect(
      divergentes,
      `A mesma tabela está declarada de formas diferentes em duas migrações: ` +
        `${divergentes.join("; ")}. Ambas com IF NOT EXISTS, a que correr primeiro ganha e ` +
        `a outra é saltada em silêncio. Uma tabela, uma declaração: quem precisa de a ` +
        `alterar usa ALTER TABLE.`,
    ).toEqual([]);
  });
});
