import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Políticas de ESCRITA na produção cuja única condição é pertencer à escola.
 *
 * `public.is_school_member(school_id)` é verdadeiro para alunos e encarregados. Uma
 * política de escrita guardada só por isso deixa um aluno gravar o que o ecrã da
 * secretaria grava. É a regra 4 de `docs/agents/DATABASE_RULES.md`, e já foi violada
 * uma dúzia de vezes.
 *
 * Existiam dois testes a vigiar isto, e nenhum conseguia ver o problema:
 *
 *   · `politicas-largas-de-escrita.test.ts` procura, nos ficheiros `.sql` do
 *     repositório, o texto literal
 *     `FOR ALL TO authenticated USING (public.is_school_member(school_id))`. Não
 *     apanha `FOR UPDATE`, nem `FOR INSERT`, nem uma condição com um termo a mais
 *     como `AND deleted_at IS NULL`.
 *   · `member-wide-policies-hardening.test.ts` lê UM ficheiro —
 *     `20260925190000_harden_member_wide_policies.sql` — e confirma que as políticas
 *     que ESSE ficheiro cria estão guardadas.
 *
 * Os dois olham para ficheiros. O esquema da produção não está nos ficheiros: parte
 * dele foi aplicada à mão, parte veio de `APPLY_*.sql`, e há políticas em produção
 * que nenhum `.sql` do repositório declara. Uma política que nunca passou por um
 * ficheiro é invisível para os dois.
 *
 * Este lê o retrato. Encontrou quatro que os outros não viam: `enrollment_applications`
 * UPDATE, `enrollment_forms` ALL, e os INSERT de `finance_invoice_events` e
 * `student_status_events`.
 *
 * Recapturar o retrato depois de aplicar SQL (`npm run siga:db-snapshot`) é o que
 * mantém este teste honesto. Sem isso, mede um passado.
 */

type Retrato = {
  politicas: Array<{
    cmd: string;
    politica: string;
    tabela: string;
    papeis: string | null;
    usando: string | null;
    verificando: string | null;
    com_verificacao?: string | null;
  }>;
};

const retrato: Retrato = JSON.parse(
  readFileSync(resolve(__dirname, "../../supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
);

/**
 * Predicados que dizem apenas «esta linha é desta escola». Não dizem QUEM é a pessoa,
 * e `is_school_member` inclui alunos e encarregados.
 */
const SO_INQUILINATO = ["is_school_member", "current_school_id", "is_active_member"];

/**
 * Guardas que constrangem de facto: papel, permissão por módulo, ou posse da própria
 * linha (`auth.uid()`). A lista foi tirada do próprio retrato — são as funções que
 * aparecem dentro de condições de políticas — e não de memória: `sga_app_role` não
 * estava na primeira versão desta lista, e por causa disso `staff_module_grants`
 * apareceu como buraco quando está correctamente guardada por
 * `private.sga_app_role(school_id) = 'Administrador'`.
 */
const GUARDAS_REAIS = [
  "has_permission",
  "can_manage_students",
  "can_read_students",
  "current_profile_role",
  "current_school_role_is",
  "current_user_can_manage",
  "is_platform_admin",
  "is_school_admin",
  "sga_app_role",
  "sga_file_role",
  "sga_file_can_write_area",
  "uid(",
];

/**
 * Por aplicar, não por tolerar. Cada entrada aponta a migração que a fecha, e sai
 * daqui quando essa migração correr e o retrato for recapturado. Só pode encolher.
 */
const POR_APLICAR = new Map<string, string>([
  ["enrollment_applications UPDATE", "20260927140000_close_last_member_wide_writes.sql"],
  ["enrollment_forms ALL", "20260927140000_close_last_member_wide_writes.sql"],
  ["finance_invoice_events INSERT", "20260927140000_close_last_member_wide_writes.sql"],
  ["student_status_events INSERT", "20260927140000_close_last_member_wide_writes.sql"],
]);

const ESCRITA = new Set(["INSERT", "UPDATE", "DELETE", "ALL"]);

function condicaoDe(p: Retrato["politicas"][number]): string {
  return [p.usando, p.verificando, p.com_verificacao].filter(Boolean).join(" ");
}

const escritasPorPertenca = retrato.politicas
  .filter((p) => ESCRITA.has(p.cmd))
  .filter((p) => {
    const cond = condicaoDe(p);
    if (!SO_INQUILINATO.some((t) => cond.includes(t))) return false;
    return !GUARDAS_REAIS.some((g) => cond.includes(g));
  });

describe("escrita por pertença à escola, medida na produção", () => {
  it("o retrato tem políticas para medir", () => {
    expect(
      retrato.politicas.length,
      "o retrato não tem políticas — corra npm run siga:db-snapshot",
    ).toBeGreaterThan(100);
  });

  it("nenhuma escrita nova depende apenas de pertencer à escola", () => {
    const novas = escritasPorPertenca
      .map((p) => `${p.tabela} ${p.cmd}`)
      .filter((chave) => !POR_APLICAR.has(chave));

    expect(
      [...new Set(novas)],
      `Estas políticas deixam qualquer membro da escola escrever, e is_school_member é ` +
        `verdadeiro para alunos e encarregados: ${[...new Set(novas)].join("; ")}. ` +
        `Confirmar quem escreve na tabela e por que cliente: se for sempre service_role, ` +
        `a política sai e o privilégio é revogado a authenticated. Ver a regra 4 de ` +
        `docs/agents/DATABASE_RULES.md e 20260927140000_close_last_member_wide_writes.sql ` +
        `como modelo.`,
    ).toEqual([]);
  });

  it("a lista de 'por aplicar' não tem entradas já fechadas", () => {
    const abertas = new Set(escritasPorPertenca.map((p) => `${p.tabela} ${p.cmd}`));
    const obsoletas = [...POR_APLICAR.keys()].filter((chave) => !abertas.has(chave));

    expect(
      obsoletas,
      `Estas entradas já estão fechadas na produção e devem sair de POR_APLICAR: ` +
        `${obsoletas.join(", ")}. Uma excepção que sobrevive à correcção é uma escrita ` +
        `que este teste deixa de verificar para sempre.`,
    ).toEqual([]);
  });
});
