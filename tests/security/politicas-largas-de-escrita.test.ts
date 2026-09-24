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
 * **Esta lista só pode encolher.** Pertencem a áreas ainda não auditadas — `school_invitations`
 * e `person_documents` são as que mais preocupam à primeira vista.
 */
const POR_FECHAR = new Set([
  "finance_payment_plans",
  "person_documents",
  "rooms",
  "school_integrations",
  "school_invitations",
  "siga_access_cards",
  "siga_access_logs",
  "siga_files",
  "siga_lesson_plan_components",
  "siga_lesson_plans",
  "siga_turnstile_devices",
  "staff_module_grants",
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

function politicasLargas() {
  const achados: Array<{ ficheiro: string; tabela: string; politica: string }> = [];
  for (const caminho of ficheirosSql(resolve(REPO, "supabase"))) {
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
