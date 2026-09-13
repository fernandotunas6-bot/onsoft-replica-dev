import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Compara o que o repositório declara com o que a produção faz.
 *
 * O esquema do SGA não está sob controlo de versões, por isso os testes que
 * lêem o SQL versionado medem apenas metade da verdade. Este mede a outra
 * metade, a partir de `supabase/PRODUCTION_SNAPSHOT.json` — um inventário de só
 * leitura capturado por `npm run siga:db-snapshot`.
 *
 * Não é um `pg_dump`: não recria nada. Serve para três coisas que antes não
 * eram possíveis: ver a divergência, impedir que ela cresça, e travar
 * regressões de postura de segurança que o repositório nunca notaria.
 */

const REPO = resolve(__dirname, "../..");
const SNAPSHOT = resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json");

type Snapshot = {
  capturadoEm: string;
  resumo: Record<string, number>;
  tabelas: Array<{
    tabela: string;
    rls: boolean;
    anon_select: boolean;
    auth_select: boolean;
    politicas: number;
  }>;
  politicas: Array<{ tabela: string; politica: string; cmd: string; usando: string }>;
  funcoes: Array<{ schema: string; funcao: string }>;
  triggers: Array<{ tabela: string; trigger: string; funcao: string }>;
};

const snap: Snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));

function repoSql(): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".sql")) files.push(full);
    }
  };
  walk(resolve(REPO, "supabase"));
  const combined = resolve(REPO, "all_migrations_combined.sql");
  if (existsSync(combined)) files.push(combined);
  return files.map((f) => readFileSync(f, "utf8")).join("\n");
}

const sql = repoSql();
const declaredTables = new Set(
  [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.(\w+)/gi)].map((m) =>
    m[1].toLowerCase(),
  ),
);

/**
 * Tabelas que existem em produção e não são declaradas no repositório.
 * Medida a 2026-09-13. A lista existe para encolher até zero — cada entrada
 * removida é uma tabela que passou a ser revisível.
 */
const NAO_DECLARADAS_HOJE = 35;

/**
 * As únicas políticas que concedem acesso ao papel anónimo, todas por desenho e
 * verificadas uma a uma a 2026-09-13:
 *
 *   enrollment_applications  INSERT sem leitura — submissão da matrícula pública
 *   enrollment_forms         SELECT limitado a formulários abertos e não apagados
 *   reserved_subdomains      lista estática de slugs reservados, lida no registo
 *   school_branding          logótipo e cores, que o login mostra antes da sessão
 *
 * Qualquer entrada nova aqui é uma decisão de expor dados sem autenticação e
 * tem de ser justificada por escrito antes de passar.
 */
const ANON_POLICIES_ESPERADAS = [
  "enrollment_applications.Public insert open enrollment applications",
  "enrollment_forms.Public read open enrollment forms",
  "reserved_subdomains.public_read_reserved_subdomains",
  "school_branding.school_members_view_branding",
];

describe("produção vs repositório", () => {
  it("o retrato existe e não está vazio", () => {
    expect(snap.tabelas.length).toBeGreaterThan(100);
    expect(snap.politicas.length).toBeGreaterThan(200);
    expect(Date.parse(snap.capturadoEm)).not.toBeNaN();
  });

  it("todas as tabelas de produção têm RLS activo", () => {
    // Cobertura total quando medida: 149 de 149. É a invariante mais
    // importante da base — perdê-la em qualquer tabela é uma fuga potencial
    // entre escolas.
    const semRls = snap.tabelas.filter((t) => !t.rls).map((t) => t.tabela);
    expect(
      semRls,
      `Tabelas em produção sem RLS: ${semRls.join(", ")}. Num Postgres ` +
        `partilhado por N escolas, RLS é a única rede por baixo da camada ` +
        `TypeScript. Voltar a capturar o retrato depois de corrigir.`,
    ).toEqual([]);
  });

  it("nenhuma política concede acesso ao papel anónimo", () => {
    // Esta é a invariante que realmente protege os dados, e é mais forte do que
    // contar concessões. 23 tabelas sensíveis — a família `hr_*` inteira mais
    // três de finanças — têm SELECT concedido ao papel `anon` ao nível da
    // tabela, ao contrário de alunos, pessoas e contas. Essa concessão é mais
    // larga do que em tudo o resto e devia ser revogada.
    //
    // Mas hoje é inerte: nenhuma das 286 políticas inclui `anon`, e todas essas
    // tabelas têm política, portanto o RLS recusa. Confirmado por sonda: a
    // consulta anónima passa e devolve vazio.
    //
    // O dia em que alguém acrescentar uma política que cubra `anon` a uma
    // destas tabelas, os dados saem. É isso que este teste impede.
    const comAnon = snap.politicas
      .filter((p) => p.papeis.includes("anon"))
      .map((p) => `${p.tabela}.${p.politica}`)
      .sort();

    expect(
      comAnon,
      `Políticas que concedem acesso ao papel anónimo: ${comAnon.join(", ")}. ` +
        `A chave anónima é pública — vai em cada browser que abre o portal. ` +
        `Qualquer política nova que a cubra torna essas linhas legíveis por toda a gente.`,
    ).toEqual(ANON_POLICIES_ESPERADAS);
  });

  it("as tabelas sensíveis com concessão a anon continuam todas cobertas por política", () => {
    // A concessão só é inofensiva enquanto houver RLS a recusar. Uma tabela
    // com SELECT para `anon` e sem política nenhuma seria leitura livre.
    const comConcessao = snap.tabelas.filter(
      (t) =>
        t.anon_select &&
        /^(students|people|profiles|school_memberships|finance_|fee_|hr_|.*secret)/.test(t.tabela),
    );
    const desprotegidas = comConcessao.filter((t) => t.politicas === 0).map((t) => t.tabela);

    expect(comConcessao.length).toBeGreaterThan(0);
    expect(
      desprotegidas,
      `Tabelas sensíveis com SELECT para anon e sem política: ${desprotegidas.join(", ")}. ` +
        `Isto é leitura livre sem autenticação.`,
    ).toEqual([]);
  });

  it("as funções de que as políticas dependem existem", () => {
    const nomes = new Set(snap.funcoes.map((f) => f.funcao));
    for (const fn of [
      "current_school_id",
      "current_school_role_is",
      "is_school_member",
      "current_teacher_id",
      "audit_row_change",
    ]) {
      expect(nomes.has(fn), `função ${fn} ausente da produção`).toBe(true);
    }
  });

  it("as notas continuam a ser auditadas", () => {
    // Ligado a 2026-09-12. As alterações de nota eram das poucas escritas
    // importantes fora da auditoria central.
    const auditada = snap.triggers.some(
      (t) => t.tabela === "siga_assessment_scores" && t.funcao === "audit_row_change",
    );
    expect(auditada, "siga_assessment_scores deixou de ter trigger de auditoria").toBe(true);
  });

  it("a divergência entre repositório e produção não cresce", () => {
    const naoDeclaradas = snap.tabelas
      .map((t) => t.tabela)
      .filter((t) => !declaredTables.has(t))
      .sort();

    expect(
      naoDeclaradas.length,
      `${naoDeclaradas.length} tabelas existem em produção sem CREATE TABLE no ` +
        `repositório (eram ${NAO_DECLARADAS_HOJE}). A produção deixa de ser ` +
        `reconstruível e nenhuma revisão de código vê estas alterações. ` +
        `Se o número desceu, actualize NAO_DECLARADAS_HOJE.\n\n${naoDeclaradas.join(", ")}`,
    ).toBeLessThanOrEqual(NAO_DECLARADAS_HOJE);
  });
});
