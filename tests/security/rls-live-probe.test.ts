import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Sonda de isolamento contra a base real, com a chave anónima.
 *
 * Os testes de `rls-school-tables.test.ts` lêem o SQL do repositório: provam que
 * a política está **escrita**. Não provam que está **aplicada** — e o esquema de
 * produção não está sob controlo de versões, por isso essa diferença é real e
 * não teórica. Há ficheiros de endurecimento que nada instruía a aplicar, e
 * tabelas que a aplicação usa sem existirem no repositório.
 *
 * Esta sonda fecha essa lacuna pelo único lado verificável de fora: tenta ler
 * tabelas sensíveis com a chave anónima e exige que venham vazias.
 *
 * Porque é seguro correr:
 *
 * - Só faz SELECT. Não cria, não altera, não apaga nada.
 * - Usa a chave publicável, que é pública por desenho e vai em cada browser que
 *   abre o portal. Não testa mais do que qualquer visitante já pode tentar.
 * - Uma tabela protegida devolve zero linhas ou um erro de permissão; ambos
 *   passam. Só falha se dados reais saírem sem autenticação.
 *
 * Corre apenas com `SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` definidos.
 * Fora disso salta, como os restantes testes que dependem de base de dados.
 *
 * ONDE ISTO CORRE HOJE — e onde não corre
 *
 * Localmente corre sempre, porque o Vite carrega o `.env`. No CI **salta**: o
 * job `quality`, que executa `bun run test`, não recebe as variáveis do
 * Supabase; só o job `ecosystem-e2e` as tem, e esse corre o smoke HTTP, não o
 * vitest.
 *
 * Isso é uma escolha, não um esquecimento: ligá-lo ao CI faria cada build
 * depender da disponibilidade da produção. Mas se a intenção for que esta
 * verificação seja contínua, bastam duas linhas no passo de testes do job
 * `quality`:
 *
 *   env:
 *     SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
 *     VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
 *
 * Sem isso, é uma ferramenta para correr à mão quando se mexe em RLS — e vale
 * a pena saber que é assim, em vez de assumir que está sempre a vigiar.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

const canProbe = Boolean(SUPABASE_URL && ANON_KEY);

/**
 * Estado observado em produção a 2026-09-12.
 *
 * Tudo o que é sensível — alunos, pessoas, facturação, recibos, segredos,
 * memberships e contas — devolve `42501`: o papel anónimo não tem privilégio
 * nenhum sobre essas tabelas. É a postura mais forte, e não depende de RLS.
 *
 * As quatro abaixo são a excepção: a consulta passa e vem vazia. Não houve
 * fuga, mas a concessão é mais larga do que em tudo o resto, e o que hoje as
 * protege pode ser apenas não haver linhas — o processamento salarial ainda
 * não está em uso. Quando estiver, a diferença deixa de ser académica.
 *
 * `supabase/HARDEN_UNPROTECTED_SCHOOL_TABLES.sql` faz `REVOKE ALL ... FROM anon`
 * e acrescenta política. Depois de aplicado, esta lista fica vazia.
 */
const ANON_REACHABLE_TODAY = [
  "hr_contracts",
  "hr_employments",
  "hr_payroll_items",
  "hr_payroll_runs",
].sort();

/**
 * Tabelas que nunca devem devolver uma linha a quem não se autenticou.
 * A coluna de razão existe para o relatório de falha dizer porque importa.
 */
const MUST_NOT_LEAK: Array<{ table: string; why: string }> = [
  { table: "hr_payroll_items", why: "vencimentos individuais do pessoal" },
  { table: "hr_payroll_runs", why: "processamento salarial da escola" },
  { table: "hr_contracts", why: "contratos de trabalho" },
  { table: "hr_employments", why: "vínculos laborais" },
  { table: "finance_invoices", why: "facturação — sem RLS declarada no repositório" },
  { table: "finance_receipts", why: "recibos — sem RLS declarada no repositório" },
  { table: "school_integration_secrets", why: "segredos de integrações" },
  { table: "students", why: "dados de menores" },
  { table: "people", why: "dados pessoais" },
  { table: "siga_assessment_scores", why: "notas" },
  { table: "school_memberships", why: "quem pertence a que escola" },
  { table: "profiles", why: "contas do portal" },
];

describe.skipIf(!canProbe)("sonda de isolamento contra a base real", () => {
  // O corpo do describe corre mesmo quando é saltado (recolha dos testes):
  // sem credenciais, criar o cliente aqui rebentava o ficheiro inteiro em vez
  // de o saltar. Só se cria quando há o que sondar.
  const anon = canProbe
    ? createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : (null as unknown as ReturnType<typeof createClient>);

  for (const { table, why } of MUST_NOT_LEAK) {
    it(`${table} não devolve linhas a um pedido anónimo (${why})`, async () => {
      const { data, error } = await anon.from(table).select("*").limit(1);

      // Erro é resultado aceitável: significa que a tabela não está exposta,
      // ou que a política recusou. O que não pode acontecer é vir uma linha.
      if (error) {
        expect(error.message.length).toBeGreaterThan(0);
        return;
      }

      expect(
        data ?? [],
        `${table} devolveu dados a um pedido SEM AUTENTICAÇÃO (${why}). ` +
          `A chave anónima é pública — vai em cada browser que abre o portal — ` +
          `por isso isto é acessível a qualquer pessoa. Aplicar ` +
          `supabase/HARDEN_UNPROTECTED_SCHOOL_TABLES.sql e confirmar RLS nesta tabela.`,
      ).toEqual([]);
      // 20s, não os 5s por omissão: isto é uma chamada de rede à produção. A 5s
      // a sonda falhava por latência, e uma falha de latência aqui lê-se como
      // "fuga de dados de vencimentos" — o alarme mais caro que este ficheiro
      // pode dar em falso. Lento não é inseguro; quem grita por tudo deixa de
      // ser ouvido quando gritar por alguma coisa.
    }, 20_000);
  }

  it("regista o que a sonda conseguiu observar", async () => {
    // Três estados, não dois. A diferença entre eles é o que orienta a acção:
    //
    //   sem_privilegio  — erro 42501: o papel anónimo nem alcança a tabela.
    //                     É a postura mais forte e não depende de RLS.
    //   consultavel     — a consulta passou e veio vazia. Ou a RLS recusou as
    //                     linhas, ou a tabela está vazia. De fora não há como
    //                     distinguir — e é essa ambiguidade que a torna digna
    //                     de atenção: se houvesse linhas e não houvesse RLS,
    //                     teriam saído.
    //   devolveu_dados  — fuga confirmada.
    const observed: Record<string, string> = {};
    for (const { table } of MUST_NOT_LEAK) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      observed[table] = error
        ? error.code === "42501"
          ? "sem_privilegio"
          : `recusado_${error.code ?? "erro"}`
        : (data?.length ?? 0) > 0
          ? "devolveu_dados"
          : "consultavel_vazio";
    }
    console.info(JSON.stringify({ probe: "rls-anon", observed }, null, 2));

    const leaking = Object.entries(observed)
      .filter(([, state]) => state === "devolveu_dados")
      .map(([table]) => table);
    expect(leaking, `fuga confirmada sem autenticação: ${leaking.join(", ")}`).toEqual([]);
  }, 30_000);

  it("as funções de que as políticas dependem existem mesmo na produção", async () => {
    // Esta era uma pergunta sem resposta: os ficheiros HARDEN_* não constavam de
    // lista nenhuma, e o esquema de produção não está no repositório, por isso
    // não havia como saber se alguma vez foram aplicados. As políticas de
    // isolamento chamam estas funções — se não existirem, as políticas que o
    // repositório declara não podem estar a proteger nada.
    //
    // Como se distingue: o PostgREST expõe funções como RPC. Uma função que
    // existe mas não está concedida ao papel anónimo devolve 42501; uma que não
    // existe devolve 42883 ou PGRST202. Verificado a 2026-09-12: as quatro
    // existem, logo HARDEN_TENANT_ISOLATION e HARDEN_TEACHER_ASSESSMENT_SCOPE
    // estão aplicados.
    const required: Array<{ fn: string; args: Record<string, unknown>; from: string }> = [
      { fn: "current_school_id", args: {}, from: "HARDEN_TENANT_ISOLATION" },
      {
        fn: "current_school_role_is",
        args: { p_allowed_roles: ["admin"] },
        from: "HARDEN_TENANT_ISOLATION",
      },
      {
        fn: "is_school_member",
        args: { p_school_id: "00000000-0000-0000-0000-000000000000" },
        from: "APPLY_ENROLLMENT_AND_PREMIUM",
      },
      { fn: "current_teacher_id", args: {}, from: "HARDEN_TEACHER_ASSESSMENT_SCOPE" },
    ];

    const missing: string[] = [];
    for (const { fn, args, from } of required) {
      const { error } = await anon.rpc(fn, args);
      const code = error?.code ?? "";
      if (code === "42883" || code === "PGRST202") missing.push(`${fn} (${from})`);
    }

    expect(
      missing,
      `Funções em falta na base de produção: ${missing.join(", ")}. As políticas ` +
        `RLS declaradas no repositório chamam-nas; sem elas, essas políticas não ` +
        `estão a proteger nada. Aplicar os ficheiros indicados — ` +
        `npm run siga:sql mostra a ordem.`,
    ).toEqual([]);
  });

  it("a superfície alcançável pelo papel anónimo não muda sem se dar por isso", async () => {
    // Observado em produção: students, people, finance_* e os segredos devolvem
    // 42501 — o papel anónimo não tem privilégio nenhum sobre elas. As `hr_*`
    // não: a consulta passa e vem vazia. Ou seja, têm uma concessão mais larga
    // do que tudo o resto, e o que hoje as protege é não haver linhas ou haver
    // RLS que o repositório não declara.
    //
    // `supabase/HARDEN_UNPROTECTED_SCHOOL_TABLES.sql` faz REVOKE ALL ... FROM
    // anon e acrescenta política. Depois de aplicado, este teste passa a exigir
    // 42501 e a diferença desaparece.
    const hrTables = MUST_NOT_LEAK.filter((entry) => entry.table.startsWith("hr_"));
    const states = await Promise.all(
      hrTables.map(async ({ table }) => {
        const { error } = await anon.from(table).select("*").limit(1);
        return { table, code: error?.code ?? null };
      }),
    );

    const reachable = states
      .filter((s) => s.code !== "42501")
      .map((s) => s.table)
      .sort();

    expect(
      reachable,
      reachable.length > ANON_REACHABLE_TODAY.length
        ? `Passaram a ser alcançáveis pelo papel anónimo tabelas que não eram: ` +
            `${reachable.join(", ")}. A superfície sem autenticação aumentou.`
        : `Boa notícia: ${ANON_REACHABLE_TODAY.join(", ")} deixaram de estar ` +
            `alcançáveis pelo papel anónimo. Actualize ANON_REACHABLE_TODAY — a ` +
            `lista existe para encolher até ficar vazia.`,
    ).toEqual(ANON_REACHABLE_TODAY);
  }, 30_000);
});

describe.skipIf(canProbe)("sonda de isolamento (saltada)", () => {
  it("precisa de SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY", () => {
    expect(canProbe).toBe(false);
  });
});
