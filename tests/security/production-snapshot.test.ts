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
  politicas: Array<{
    tabela: string;
    politica: string;
    cmd: string;
    papeis: string;
    usando: string;
  }>;
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
 * Eram 35 a 2026-09-13. Passaram a 0 a 2026-09-14, com a captura do DDL real de
 * cada uma em `supabase/migrations/20260914151906_capture_undeclared_production_tables.sql`
 * (gerado por `npm run siga:db-ddl`, lido do catálogo do Postgres).
 *
 * Agora que está a zero, deixa de ser um travão e passa a ser uma invariante:
 * qualquer tabela criada ao vivo sem passar pelo repositório reprova aqui.
 */
const NAO_DECLARADAS_HOJE = 0;

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

/**
 * Tabelas que o código consulta e que **não existem na base de produção** —
 * nem no esquema `public`, nem em nenhum outro. Medido a 2026-09-14 contra o
 * retrato e confirmado por consulta directa ao catálogo.
 *
 * É uma classe diferente da divergência acima. Aqui não é o repositório que
 * está atrasado em relação à produção: é a produção que nunca recebeu o que o
 * repositório já assume existir. Cada uma destas consultas devolve o erro de
 * tabela inexistente do PostgREST em tempo de execução.
 *
 * Três grupos, por ordem de gravidade:
 *
 *   1. Camada de comunicação e OTP (Ciclos 85–86) — `verification_otps`,
 *      `communication_dispatches` e `communication_events` estão declaradas em
 *      `supabase/migrations/20260911120000_central_communication_and_otp.sql`,
 *      que nunca foi aplicada ao SGA. `contact_verification_profiles` e
 *      `user_communication_preferences` não estavam declaradas em lado nenhum
 *      até 2026-09-16, e nessa data foram declaradas **e** aplicadas
 *      (`20260916130000_contact_verification_and_communication_preferences.sql`).
 *      O grupo 1 está fechado.
 *   2. Caixas de correio de tenant — `tenant_mailboxes`, declarada em
 *      `supabase/APPLY_MAILBOXES.sql`, script manual também por aplicar.
 *   3. Importadores contra o esquema Lovable antigo — `courses`, `invoices`,
 *      `payments` e `class_schedule_slots` são nomes do esquema que o SGA nunca
 *      teve. Os importadores respectivos foram remapeados; o grupo está fechado.
 *
 * A lista existe para encolher até zero. Falta um: `tenant_mailboxes`, que
 * precisa de decisão, não só de SQL.
 */
/**
 * Cada entrada diz que funcionalidade fica partida enquanto a tabela não
 * existir. Sem isso, a lista é trivia inerte: era uma lista de nomes, e
 * ninguém tinha ligado `invoices` a «a importação de dívidas falha».
 *
 * As três da central de comunicação saíram desta lista a 2026-09-14, com a
 * migração `20260911120000_central_communication_and_otp.sql` aplicada.
 *
 * `courses`, `invoices`, `payments` e `class_schedule_slots` saíram a
 * 2026-09-15: os cinco importadores (`cursos`, `horarios`, `dividas`,
 * `pagamentos`, `historico_financeiro`) foram remapeados para o modelo real —
 * `programs`, `timetable_slots` (via `class_subjects`), `finance_invoices` e
 * `finance_receipts` (via `finance_contracts`) — em vez do esquema Lovable que
 * a produção nunca teve.
 *
 * `assessment_rule_sets` (e `assessment_key_subjects`) saíram a 2026-09-20, com
 * a migração `20260916140000_assessment_rule_sets.sql` aplicada à produção. Era
 * a entrada mais cara da lista: `gradebooks.rule_set_id` é NOT NULL e o caminho
 * legado só abre um diário com um `rule_set_id` desta tabela ou emprestado de
 * outro diário da escola — numa escola nova não havia nenhum dos dois, logo não
 * se abria o primeiro diário nem se lançavam notas.
 */
const TABELAS_AUSENTES_DA_PRODUCAO = new Set([
  // Caixas de correio por tenant, no Control Center: sem a tabela, o
  // aprovisionamento de caixas institucionais não grava nem lista nada.
  "tenant_mailboxes",
]);

/** Tabelas consultadas pelo código — `.from("x")`, excluindo buckets de storage. */
function tabelasUsadasPelaApp(): string[] {
  const encontradas = new Set<string>();
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) {
        const code = readFileSync(full, "utf8");
        for (const m of code.matchAll(/(\.storage)?\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) {
          if (!m[1]) encontradas.add(m[2]);
        }
      }
    }
  };
  walk(resolve(REPO, "src"));
  return [...encontradas].sort();
}

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

  it("nenhuma tabela de produção existe sem declaração no repositório", () => {
    const naoDeclaradas = snap.tabelas
      .map((t) => t.tabela)
      .filter((t) => !declaredTables.has(t))
      .sort();

    expect(
      naoDeclaradas.length,
      `${naoDeclaradas.length} tabelas existem em produção sem CREATE TABLE no ` +
        `repositório (o limite é ${NAO_DECLARADAS_HOJE}). A produção deixa de ser ` +
        `reconstruível e nenhuma revisão de código vê estas alterações. ` +
        `Capturar o DDL real com \`npm run siga:db-ddl\` em vez de escrever o ` +
        `CREATE TABLE à mão — um esquema adivinhado mente na primeira ` +
        `divergência.\n\n${naoDeclaradas.join(", ")}`,
    ).toBeLessThanOrEqual(NAO_DECLARADAS_HOJE);
  });

  it("a captura de DDL cobre cada tabela que o retrato conhece", () => {
    // O ficheiro de captura é gerado, não escrito. Se alguém o editar à mão e
    // apagar uma tabela, a divergência real volta sem o teste acima dar por ela
    // (a tabela continuaria declarada noutro ficheiro qualquer... ou não).
    // Localizado por padrão, e não por nome fixo: a captura é regerada com um carimbo
    // novo a cada vez, e o nome antigo (20260914151906) deixou este teste a falhar desde
    // que ela foi regerada a 2026-09-24. Um teste que se parte sozinho ao correr o
    // procedimento que ele próprio documenta deixa de ser lido.
    const capturas = readdirSync(resolve(REPO, "supabase/migrations"))
      .filter((f) => f.endsWith("_capture_undeclared_production_tables.sql"))
      .sort();
    expect(capturas.length, "ficheiro de captura de DDL desapareceu").toBeGreaterThan(0);
    const captura = resolve(REPO, "supabase/migrations", capturas[capturas.length - 1]!);
    expect(existsSync(captura), "ficheiro de captura de DDL desapareceu").toBe(true);

    const ddl = readFileSync(captura, "utf8");
    const capturadas = new Set(
      [...ddl.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/gi)].map((m) =>
        m[1].toLowerCase(),
      ),
    );
    // Limiar, não igualdade: regerar a captura pode acrescentar tabelas legitimamente, e
    // o que este teste quer apanhar é o contrário — alguém editá-la à mão e tirar uma.
    expect(capturadas.size).toBeGreaterThanOrEqual(35);

    // Tudo o que a captura declara tem de existir mesmo em produção — o
    // contrário seria declarar tabelas fantasma.
    const emProducao = new Set(snap.tabelas.map((t) => t.tabela));
    const fantasmas = [...capturadas].filter((t) => !emProducao.has(t)).sort();
    expect(
      fantasmas,
      `declaradas na captura mas ausentes da produção: ${fantasmas.join(", ")}`,
    ).toEqual([]);
  });

  it("nenhuma consulta nova aponta para uma tabela que não existe em produção", () => {
    const emProducao = new Set(snap.tabelas.map((t) => t.tabela));
    const ausentes = tabelasUsadasPelaApp().filter((t) => !emProducao.has(t));
    const novas = ausentes.filter((t) => !TABELAS_AUSENTES_DA_PRODUCAO.has(t));

    expect(
      novas,
      `A aplicação passou a consultar tabelas que não existem na base de ` +
        `produção: ${novas.join(", ")}. Em tempo de execução isto é o erro de ` +
        `tabela inexistente do PostgREST, não um ecrã vazio. Aplicar o SQL que ` +
        `as cria (npm run siga:sql) antes de lançar o código que as usa.`,
    ).toEqual([]);
  });

  it("a lista de tabelas ausentes da produção não tem entradas obsoletas", () => {
    const emProducao = new Set(snap.tabelas.map((t) => t.tabela));
    const usadas = new Set(tabelasUsadasPelaApp());
    const resolvidas = [...TABELAS_AUSENTES_DA_PRODUCAO]
      .filter((t) => emProducao.has(t) || !usadas.has(t))
      .sort();

    expect(
      resolvidas,
      `entradas que já não descrevem uma falha real e podem sair da lista: ` +
        `${resolvidas.join(", ")} (ou a tabela passou a existir em produção, ou ` +
        `o código deixou de a consultar). Voltar a capturar o retrato primeiro: ` +
        `npm run siga:db-snapshot.`,
    ).toEqual([]);
  });
});
