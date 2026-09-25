import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

/**
 * `public.is_school_member(school_id)` é `EXISTS (school_memberships activa)` — **não olha
 * ao papel**. Numa política `FOR ALL TO authenticated`, dá escrita a qualquer membro da
 * escola, e `Aluno` e `Encarregado` são papéis com membership.
 *
 * Pior: o PostgreSQL combina políticas permissivas com **OR**. Uma destas ao lado de uma
 * política estrita não a complementa — anula-a. Foi assim que
 * `current_user_can_manage_assessment_score`, escrita de propósito para restringir quem
 * lança notas, deixou de valer nada em produção (docs/auditoria/05-auditoria.md).
 *
 * A causa é mecânica e vai repetir-se sozinha: três scripts corridos à mão disputam o
 * mesmo nome de política com forças diferentes (`APPLY_ENROLLMENT_AND_PREMIUM.sql` a fraca,
 * `HARDEN_TENANT_ISOLATION.sql` a forte), e ganha o último que correr.
 *
 * Este teste não corrige nada — impede que a lista cresça, e obriga a que encolher seja
 * deliberado.
 */

const REPO = resolve(__dirname, "../..");

/**
 * As que ainda estão por fechar, com a tabela a que pertencem. Cada uma precisa da mesma
 * análise que as sete já fechadas exigiram: *quem escreve nesta tabela, e por que client?*
 * Se for sempre service_role, a política passa a `FOR SELECT` e o buraco fecha.
 *
 * **Esta lista só pode encolher.** Pertencem a áreas ainda não auditadas.
 */
const POR_FECHAR = new Set([
]);

/** Fechadas em 20260924123000. Voltar a abri-las é o que este teste existe para apanhar. */
const JA_FECHADAS = [
  "siga_assessment_items",
  "siga_assessment_scores",
  "siga_attendance_sessions",
  "siga_attendance_records",
  "siga_attendance_justifications",
  "student_academic_history",
  "student_status_history",
  // Fechadas depois, pela mesma analise:
  //   person_documents → 20260924140000 (documentos de identidade)
  //   siga_files       → 20260924072000 (biblioteca de ficheiros da escola)
  "person_documents",
  "siga_files",
  // Caminhos de escalada, fechados em 20260924170000:
  //   school_invitations  → `role_code` num convite que qualquer membro criava
  //   staff_module_grants → qualquer membro concedia modulos a si proprio
  "school_invitations",
  "staff_module_grants",
  // Sem escrita pela sessão, logo `ALL → SELECT` bastou (20260924180000):
  "siga_access_logs",
  "siga_lesson_plan_components",
  // Fechadas por 20260924230000, e aqui **sem** política de SELECT sequer: as duas guardam
  // credenciais de acesso físico (`api_key` do leitor, `qr_secret`/`rfid_tag` do passe) e
  // uma política de linha não esconde uma coluna. Toda a aplicação as lê por service_role.
  "siga_access_cards",
  "siga_turnstile_devices",
];

const PADRAO =
  /CREATE POLICY\s+"([^"]+)"\s*(?:ON\s+public\.(\w+)\s*)?\n?\s*(?:ON\s+public\.(\w+)\s*)?\n?\s*FOR ALL TO authenticated\s*\n\s*USING \(public\.is_school_member\(school_id\)\)/gm;

function ficheirosSql(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = resolve(dir, entrada);
    if (statSync(caminho).isDirectory()) ficheirosSql(caminho, acc);
    else if (entrada.endsWith(".sql")) acc.push(caminho);
  }
  return acc;
}

/**
 * Migrações numeradas já aplicadas cuja política foi substituída depois. Uma
 * migração corre uma vez: reescrevê-la não muda a produção e apaga o registo do
 * que aconteceu. Um `APPLY_*.sql` é outra coisa — pode voltar a correr a qualquer
 * momento, e por isso continua a ser varrido.
 *
 * Entrar aqui exige que a produção já tenha a forma certa — confirme no
 * `PRODUCTION_SNAPSHOT.json` antes de acrescentar.
 */
const HISTORICO_SUBSTITUIDO = new Map<string, string>([
  [
    "supabase/migrations/20260908175000_base_rooms_table.sql",
    "criou `Academic access in own school` FOR ALL em `rooms`; a produção tem hoje " +
      "`Create/Read/Update rooms in own school`, por comando e com verificação de papel",
  ],
]);

function politicasLargas() {
  const achados: Array<{ ficheiro: string; tabela: string; politica: string }> = [];
  for (const caminho of ficheirosSql(resolve(REPO, "supabase"))) {
    if (HISTORICO_SUBSTITUIDO.has(relative(REPO, caminho))) continue;
    const fonte = readFileSync(caminho, "utf8");
    for (const m of fonte.matchAll(PADRAO)) {
      achados.push({
        ficheiro: relative(REPO, caminho),
        tabela: m[2] ?? m[3] ?? "?",
        politica: m[1]!,
      });
    }
  }
  return achados;
}

describe("políticas FOR ALL com is_school_member", () => {
  it("nenhuma tabela já fechada volta a ter escrita por simples pertença à escola", () => {
    const tabelas = new Set(politicasLargas().map((a) => a.tabela));
    const reabertas = JA_FECHADAS.filter((tabela) => tabelas.has(tabela));

    expect(
      reabertas,
      "estas tabelas foram fechadas por 20260924123000 — reabri-las devolve a escrita de " +
        "notas, presenças e histórico a qualquer aluno autenticado",
    ).toEqual([]);
  });

  it("a lista de tabelas por fechar não cresce", () => {
    const tabelas = [...new Set(politicasLargas().map((a) => a.tabela))].sort();
    const novas = tabelas.filter((tabela) => !POR_FECHAR.has(tabela));

    expect(
      novas,
      "política nova com escrita para qualquer membro da escola: prefira FOR SELECT, ou " +
        "acrescente a condição de papel, como HARDEN_TENANT_ISOLATION.sql faz",
    ).toEqual([]);
  });

  it("a lista por fechar está actualizada — encolher exige tirar daqui também", () => {
    const tabelas = new Set(politicasLargas().map((a) => a.tabela));
    const jaNaoExistem = [...POR_FECHAR].filter((tabela) => !tabelas.has(tabela)).sort();

    expect(
      jaNaoExistem,
      "já não há política larga para estas tabelas: retire-as de POR_FECHAR",
    ).toEqual([]);
  });
});
