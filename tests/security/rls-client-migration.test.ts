import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * Progresso do ARQ-01, travado por teste.
 *
 * O isolamento entre escolas assenta hoje na camada TypeScript: quase tudo lê
 * com `loadSgaAdminClient()`, que usa o service role e ignora RLS. Um `.eq()`
 * esquecido devolve dados de outra escola e nada na base o impede.
 *
 * A migração é ficheiro a ficheiro, e cada troca exige evidência da base — não
 * do SQL versionado, que não descreve a produção. `npm run siga:rls-readiness`
 * produz essa evidência.
 *
 * Este teste faz duas coisas: impede que um módulo já migrado volte atrás, e
 * impede que o número de ficheiros privilegiados cresça sem alguém reparar.
 */

const REPO = resolve(__dirname, "../..");

/**
 * Migrados para `context.supabase`. Cada entrada diz porque foi seguro — a
 * política que o permite está no cabeçalho do próprio ficheiro.
 *
 * `aindaPrivilegiado` marca migração parcial: parte do ficheiro passou para o
 * cliente do utilizador e parte ficou no service role, com razão escrita.
 */
const MIGRADOS = [
  {
    ficheiro: "src/features/dashboard/server.ts",
    porque:
      "só lê, e as três políticas somadas de students/enrollments/people mais a " +
      "de finance_invoices concedem, a cada papel que a função deixa entrar, " +
      "pelo menos o que o gate em TypeScript já concedia",
  },
  {
    ficheiro: "src/features/spotlight/server.ts",
    porque:
      "school_settings tem política SELECT para authenticated com " +
      "USING private.is_active_member(school_id); só a leitura migrou, porque " +
      "a tabela não tem política de UPDATE e a de INSERT exige is_aal2()",
    aindaPrivilegiado: true,
  },
  {
    ficheiro: "src/features/access/grants.ts",
    porque:
      "staff_module_grants tem política ALL para authenticated com " +
      "USING/CHECK is_school_member(school_id): cobre select, upsert e delete",
  },
];

/**
 * Usam o cliente privilegiado por razão de desenho, não por dívida. Não entram
 * na contagem de dívida abaixo.
 */
const PRIVILEGIO_POR_DESENHO = new Set([
  // Regista cada documento oficial emitido (audit_logs, só o servidor grava) e
  // verifica-o publicamente, sem sessão, a partir do código impresso.
  "src/features/documents/verification.ts",

  // Grava em `audit_logs`, que não tem política de escrita para utilizadores:
  // o registo de auditoria só é escrito pelo servidor.
  "src/features/audit/record-audit.ts",

  // O professor grava a sua escolha de visibilidade do contacto numa entrada
  // de `school_settings`, que o RLS só deixa escrever à administração. O
  // servidor limita a escrita ao `teacher_id` da própria conta.
  "src/features/people/teacher-contact-visibility.ts",

  // Portal do aluno/encarregado (agenda, horário, notas). O RLS não deixa o
  // aluno ler matrículas, turmas, disciplinas nem notas. resolveVisibleStudent
  // só responde a Aluno (a si próprio) e Encarregado (educandos ligados).
  "src/features/dashboard/student-access.ts",

  // Detalhes da aula, tarefas e lembretes: tabelas só do servidor (FORCE RLS,
  // sem acesso para authenticated). A autorização é por papel e por
  // professor da disciplina (assertCanManageClassSubject).
  "src/features/academic/timetable-lessons.ts",

  // Painel de avaliações do professor: lê diários, notas e matrículas das
  // turmas que o próprio professor lecciona (teachers.user_id = sessão).
  "src/features/academic/teacher-assessments.ts",

  // Estrutura académica: só contagens (head: true) para o pessoal da escola;
  // várias tabelas contadas (audit_logs, grade_sheets) não têm leitura por
  // RLS para Professor.
  "src/features/academic/academic-structure.ts",

  // Pautas oficiais: leituras (pauta, linhas, diários, notas) para o pessoal
  // da escola; gerar e mudar de estado vão pela sessão do utilizador
  // (build_grade_sheet / transition_grade_sheet com permissões e 2FA).
  "src/features/academic/grade-sheets.ts",

  // Pedidos de alteração de nota: grade_scores/grade_score_history só pelo
  // servidor; pedir exige ser o professor da disciplina ou a coordenação,
  // decidir só a coordenação (Administrador/Secretaria).
  "src/features/academic/grade-change-requests.ts",

  // Modelos de avaliação: `assessment_rule_sets` só tem leitura por RLS e a
  // função de produção não é SECURITY DEFINER; publicar vai por
  // `siga_publish_assessment_rule` (só service_role), depois de validar
  // Administrador + 2FA (aal2) no servidor.
  "src/features/academic/assessment-models.ts",

  // Exames e resultado final: siga_exam_* são só do servidor (FORCE RLS, sem
  // acesso de cliente); lê a pauta anual e escreve inscrições e notas depois
  // de validar Administrador/Secretaria (Professor só consulta).
  "src/features/academic/exams.ts",

  // Resultado final: lê a pauta anual e os exames e grava no histórico
  // académico (só do servidor desde 20260927090000) e em enrollments.
  "src/features/academic/final-results.ts",

  // Sinais automáticos de risco: faltas da chamada (siga_attendance_*) e limite
  // do modelo, lidos pelo servidor para o pessoal da escola; devolve só
  // percentagens por matrícula da turma pedida.
  "src/features/academic/early-warning-server.ts",

  // Competências: siga_competencies / siga_assessment_item_competencies só do
  // servidor; definir é da coordenação, ligar avaliações do professor da
  // disciplina (verificado em teachers/class_subjects) ou da coordenação.
  "src/features/academic/competencies.ts",

  // Limite de tentativas partilhado entre instâncias: pedidos sem sessão (login
  // por B.I.), por isso só a chave de serviço executa siga_rate_limit_consume.
  "src/lib/shared-rate-limit.ts",

  // Agendador dos lembretes da véspera: sem sessão (quem chama é o cron),
  // autenticado por SIGA_CRON_SECRET em tempo constante.
  "src/routes/api/cron/lesson-reminders.tsx",

  // Corre antes de existir sessão: resolve BI → e-mail no ecrã de entrada.
  // Não há JWT para levar, logo não há cliente de utilizador possível.
  "src/features/access/bi-login.ts",

  // Cria o tenant, a escola, a conta e a membership. Enquanto corre, o
  // utilizador ainda não é membro de nada — nenhuma política de escola lhe
  // daria acesso, porque a escola só existe no fim.
  "src/features/saas/provisioning-core.ts",

  // Resolve a escola pelo slug ou pelo hostname antes do ecrã de entrada. Sem
  // sessão não há JWT; a projecção pública é a protecção (ver SEC-04).
  "src/features/saas/tenant-lookup.ts",

  // Webhook de entrada da Resend: quem chama é a Resend, não um utilizador.
  // A assinatura Svix é a autenticação.
  "src/routes/api/integrations/resend.webhook.tsx",

  // Os três seguintes servem tanto o administrador de plataforma como o da
  // escola. O de plataforma não é membro de escola nenhuma, por isso as
  // políticas school-scoped recusá-lo-iam; a autorização vive em
  // `requirePlatformAdminFromRequest` / `requireTenantAccess`.
  "src/routes/api/saas/domains.poll.tsx",
  "src/routes/api/saas/email.routes.tsx",
  "src/routes/api/saas/mailboxes.tsx",

  // Catálogo salarial (entrou a 2026-09-24). As cinco tabelas -- `hr_salary_scales`,
  // `hr_salary_scale_versions`, `hr_salary_scale_steps`, `hr_salary_change_requests`
  // e `hr_contract_salary_amendments` -- têm RLS activo e **zero políticas**: o
  // cliente da sessão não consegue lê-las de todo.
  //
  // Isto é privilégio por ausência de regra, não por desenho. Fecha em segurança
  // na base, mas deixa toda a autorização em código de aplicação, sem segunda
  // camada — e são dados salariais. Quando as políticas existirem, migrar e tirar
  // estes três daqui.
  "src/features/hr/salary-amendments.ts",
  "src/features/hr/salary-catalog.ts",
  "src/features/hr/salary-changes.ts",
]);

/**
 * Lê código, não prosa.
 *
 * A primeira versão procurava a palavra em todo o ficheiro e acusou
 * `access/grants.ts` de ter voltado ao service role por causa de uma frase no
 * comentário que explica porque deixou de o usar. Um teste que não distingue
 * uma chamada de uma menção acaba a ensinar as pessoas a não escrever
 * comentários.
 */
function semComentarios(código: string): string {
  return código.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function usaClientePrivilegiado(código: string): boolean {
  return /loadSgaAdminClient\s*\(/.test(semComentarios(código));
}

function ficheirosComClientePrivilegiado(): string[] {
  const encontrados: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (usaClientePrivilegiado(readFileSync(full, "utf8"))) {
        encontrados.push(relative(REPO, full));
      }
    }
  };
  walk(resolve(REPO, "src"));
  return encontrados.sort();
}

const privilegiados = ficheirosComClientePrivilegiado();

/**
 * Tecto da dívida — ficheiros com privilégio que não está justificado acima.
 * Desce quando um módulo migra; nunca sobe sem alguém decidir que sobe.
 *
 * Em 2026-09-14, antes da primeira fatia, eram 82 ficheiros a usar o service
 * role. Depois de migrar `access/grants.ts`, a leitura de `spotlight/server.ts`
 * e `dashboard/server.ts`, e de justificar os sete de privilégio-por-desenho, a
 * dívida real é 72.
 */
const TECTO_FICHEIROS_PRIVILEGIADOS = 72;

describe("migração para o cliente que respeita RLS (ARQ-01)", () => {
  it("o conjunto inspeccionado é o que se diz", () => {
    expect(privilegiados.length).toBeGreaterThan(50);
  });

  it.each(MIGRADOS)(
    "$ficheiro não volta ao service role",
    ({ ficheiro, porque, aindaPrivilegiado }) => {
      const caminho = resolve(REPO, ficheiro);
      expect(existsSync(caminho), `${ficheiro} desapareceu — actualize a lista`).toBe(true);
      const código = readFileSync(caminho, "utf8");

      // Uma migração pode ser parcial de propósito: no spotlight, a leitura passou
      // para o cliente do utilizador e a escrita não, porque a tabela não tem
      // política de UPDATE. Marcar isso é mais honesto do que fingir que o
      // ficheiro inteiro migrou ou deixá-lo fora da lista.
      if (!aindaPrivilegiado) {
        expect(
          usaClientePrivilegiado(código),
          `${ficheiro} voltou a usar o service role. Foi migrado porque ${porque}. ` +
            `Se a política mudou, confirme com \`npm run siga:rls-readiness\` antes de reverter.`,
        ).toBe(false);
      }

      expect(
        código.includes("context.supabase"),
        `${ficheiro} deixou de usar o cliente do utilizador`,
      ).toBe(true);
    },
  );

  it("a dívida não cresce", () => {
    const emDívida = privilegiados.filter((f) => !PRIVILEGIO_POR_DESENHO.has(f));
    expect(
      emDívida.length,
      `${emDívida.length} ficheiros usam o cliente privilegiado (tecto: ${TECTO_FICHEIROS_PRIVILEGIADOS}). ` +
        `Se é código novo, prefira \`context.supabase\` — as políticas já existem para a maioria ` +
        `das tabelas nucleares. Se o privilégio é mesmo necessário, junte o ficheiro a ` +
        `PRIVILEGIO_POR_DESENHO com a razão escrita.`,
    ).toBeLessThanOrEqual(TECTO_FICHEIROS_PRIVILEGIADOS);
  });

  it("nenhum ficheiro migrado aparece na lista de privilégio por desenho", () => {
    const confusos = MIGRADOS.filter((m) => PRIVILEGIO_POR_DESENHO.has(m.ficheiro));
    expect(confusos.map((c) => c.ficheiro)).toEqual([]);
  });

  it("a lista de privilégio por desenho não tem entradas obsoletas", () => {
    const obsoletas = [...PRIVILEGIO_POR_DESENHO].filter((f) => !privilegiados.includes(f));
    expect(
      obsoletas,
      `já não usam o cliente privilegiado e podem sair da lista: ${obsoletas.join(", ")}`,
    ).toEqual([]);
  });
});
