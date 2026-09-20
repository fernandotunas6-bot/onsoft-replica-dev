import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * As duas tabelas de `features/contacts` são o caso invertido das 35 capturadas em
 * `20260914151906_capture_undeclared_production_tables.sql`: aquelas existiam na base e
 * faltavam ao repositório, e o DDL foi lido do catálogo do Postgres precisamente para não
 * ser adivinhado. `contact_verification_profiles` e `user_communication_preferences` não
 * existem em lado nenhum — não há catálogo de onde as ler, e o esquema teve de ser escrito
 * a partir das interfaces do serviço.
 *
 * É a única forma de o fazer, e é também a forma que apodrece em silêncio: um campo novo
 * em `ContactVerificationProfileRow` compila, passa nos testes, e só falha em produção com
 * o `PGRST204` de coluna inexistente — que o serviço transforma em «Falha ao atualizar».
 *
 * Este teste prende os dois lados um ao outro. Enquanto as tabelas não existirem na base,
 * é o que substitui o retrato de produção; quando existirem,
 * `colunas-inexistentes.test.ts` passa a cobri-las sozinho e este pode sair.
 */

const REPO = resolve(__dirname, "../..");
const MIGRACAO = resolve(
  REPO,
  "supabase/migrations/20260916130000_contact_verification_and_communication_preferences.sql",
);
const SERVICO = resolve(REPO, "src/features/contacts/contact-verification-service.ts");

const sql = readFileSync(MIGRACAO, "utf8");
const ts = readFileSync(SERVICO, "utf8");

/**
 * As linhas de definição de coluna de um `CREATE TABLE`, cada uma com o nome já extraído.
 *
 * Uma só travessia serve os três testes abaixo: dois querem os nomes, o terceiro quer
 * também o resto da linha (para ver `NOT NULL` e `DEFAULT`). Tê-la duas vezes era como
 * isto começou, e as duas cópias já divergiam no filtro — a segunda deixava passar uma
 * linha `CONSTRAINT … CHECK (…)` como se fosse uma coluna chamada «constraint».
 */
function linhasDeColuna(tabela: string): Array<{ nome: string; linha: string }> {
  const corpo = new RegExp(
    `CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?public\\.${tabela}\\s*\\(([\\s\\S]*?)\\n\\);`,
    "i",
  ).exec(sql);
  if (!corpo) throw new Error(`CREATE TABLE de ${tabela} não encontrado em ${MIGRACAO}`);

  const linhas: Array<{ nome: string; linha: string }> = [];
  for (const bruta of corpo[1].split("\n")) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("--")) continue;
    if (/^(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(linha)) continue;
    const nome = /^([a-z_][a-z0-9_]*)\s/i.exec(linha);
    if (nome) linhas.push({ nome: nome[1].toLowerCase(), linha });
  }
  return linhas;
}

const colunasDaTabela = (tabela: string) => new Set(linhasDeColuna(tabela).map((c) => c.nome));

/** Campos de uma interface de linha do serviço (`chave: tipo;`), incluindo os opcionais. */
function camposDaInterface(nome: string): Set<string> {
  const bloco = new RegExp(`interface ${nome}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(ts);
  if (!bloco) throw new Error(`interface ${nome} não encontrada em ${SERVICO}`);

  const campos = new Set<string>();
  for (const linha of bloco[1].split("\n")) {
    const m = /^\s*([a-z_][a-z0-9_]*)\??\s*:/i.exec(linha);
    if (m) campos.add(m[1].toLowerCase());
  }
  return campos;
}

const PARES: Array<{ tabela: string; interfaceTs: string }> = [
  { tabela: "contact_verification_profiles", interfaceTs: "ContactVerificationProfileRow" },
  { tabela: "user_communication_preferences", interfaceTs: "UserCommunicationPreferencesRow" },
];

describe("esquema declarado de contactos vs o que o serviço lê", () => {
  it("lê colunas e campos suficientes para a verificação valer", () => {
    for (const { tabela, interfaceTs } of PARES) {
      expect(colunasDaTabela(tabela).size, `poucas colunas lidas de ${tabela}`).toBeGreaterThan(8);
      expect(
        camposDaInterface(interfaceTs).size,
        `poucos campos em ${interfaceTs}`,
      ).toBeGreaterThan(8);
    }
  });

  it.each(PARES)("$tabela declara todos os campos que o serviço lê", ({ tabela, interfaceTs }) => {
    const colunas = colunasDaTabela(tabela);
    const emFalta = [...camposDaInterface(interfaceTs)].filter((c) => !colunas.has(c)).sort();

    expect(
      emFalta,
      `O serviço lê estes campos de ${tabela} e a migração não os declara: ` +
        `${emFalta.join(", ")}. Um select de coluna inexistente é recusado inteiro pelo ` +
        `PostgREST, e o serviço devolve isso como perfil em falta.`,
    ).toEqual([]);
  });

  it.each(PARES)("$tabela não declara colunas que ninguém lê", ({ tabela, interfaceTs }) => {
    const campos = camposDaInterface(interfaceTs);
    const aMais = [...colunasDaTabela(tabela)].filter((c) => !campos.has(c)).sort();

    expect(
      aMais,
      `A migração declara colunas de ${tabela} que o serviço não conhece: ${aMais.join(", ")}. ` +
        `Como não há tabela em produção de onde ler o esquema, este ficheiro é a definição — ` +
        `uma coluna a mais aqui é uma coluna que nunca ninguém vai preencher.`,
    ).toEqual([]);
  });

  it.each(PARES)("$tabela nasce preenchida com o insert do serviço", ({ tabela }) => {
    // `getOrCreateProfile` e `getOrCreateCommunicationPreferences` inserem apenas
    // `user_id` e `school_id`. Qualquer outra coluna NOT NULL sem DEFAULT faz a criação
    // do perfil rebentar com 23502 na primeira utilização — e o serviço traduz isso para
    // «Falha ao criar perfil», sem dizer qual coluna.
    const FORNECIDAS_PELO_INSERT = new Set(["user_id", "school_id"]);

    const semRede = linhasDeColuna(tabela)
      .filter(({ nome, linha }) => {
        if (FORNECIDAS_PELO_INSERT.has(nome)) return false;
        const obrigatoria = /\bNOT NULL\b/i.test(linha) || /\bPRIMARY KEY\b/i.test(linha);
        return obrigatoria && !/\bDEFAULT\b/i.test(linha);
      })
      .map(({ nome }) => nome)
      .sort();

    expect(
      semRede,
      `Em ${tabela}, estas colunas são obrigatórias e não têm DEFAULT: ${semRede.join(", ")}. ` +
        `O insert do serviço só fornece user_id e school_id — a criação do perfil ` +
        `falharia com 23502 na primeira utilização.`,
    ).toEqual([]);
  });
});
