import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Folha salarial e pagamentos exigem 2FA (20260930190000). Na base, sem aal2 um
 * UPDATE não dá erro, só não altera linhas: aprovar a folha «funcionava» sem
 * aprovar nada. Por isso cada acção do servidor que chama uma função da folha
 * com o JWT do utilizador tem de verificar aal2 antes, com uma mensagem clara.
 */

const REPO = resolve(__dirname, "../..");
const HR_DIR = resolve(REPO, "src/features/hr");

/** Funções hr_* chamadas com o JWT que não mexem em dinheiro (e porquê). */
const NOT_MONEY: Record<string, string> = {
  hr_redeem_teacher_qr: "SECURITY DEFINER; presença do professor por QR",
  hr_redeem_teacher_qr_secure: "SECURITY DEFINER; presença do professor por QR (versão endurecida)",
  hr_evaluate_teacher_attendance_assurance: "SECURITY DEFINER; prova de presença",
  hr_materialize_teacher_lessons: "escreve aulas previstas, não valores",
  // As três abaixo só escrevem hr_teacher_lesson_occurrences (verificado na base a
  // 2026-09-30), cujos triggers não escrevem em tabelas de dinheiro.
  hr_assign_teacher_substitute: "gestão de aulas: substituição",
  hr_create_extra_teacher_lesson: "gestão de aulas: aula extraordinária",
  hr_evaluate_teacher_lesson_attendance: "gestão de aulas: avaliação da presença",
};

const handlers = readdirSync(HR_DIR)
  .filter((f) => f.endsWith(".ts"))
  .flatMap((file) => {
    const source = readFileSync(resolve(HR_DIR, file), "utf8");
    return source
      .split(/(?=export const \w+ = createServerFn)/)
      .filter((chunk) => chunk.startsWith("export const"))
      .map((chunk) => ({ file, name: /export const (\w+)/.exec(chunk)![1]!, chunk }));
  });

const moneyCalls = handlers.flatMap((h) =>
  [...h.chunk.matchAll(/rpc\(\s*"(hr_[a-z_]+)"/g)]
    .map((m) => m[1]!)
    .filter((fn) => !(fn in NOT_MONEY))
    .map((fn) => ({ ...h, fn })),
);

describe("folha salarial e pagamentos com 2FA", () => {
  it("encontra as chamadas (se ficar vazio, o teste passaria em branco)", () => {
    expect(moneyCalls.map((c) => c.fn).sort()).toEqual(
      [
        "hr_apply_approved_salary_change",
        "hr_approve_payroll_run",
        "hr_authorize_payroll_payment_batch",
        "hr_calculate_payroll_run",
        "hr_create_payroll_payment_batch",
        "hr_create_payroll_run",
        "hr_refresh_payroll_payment_batch",
      ].sort(),
    );
  });

  it.each(moneyCalls.map((c) => [`${c.file}:${c.name} → ${c.fn}`, c] as const))(
    "%s verifica aal2 antes de chamar a base",
    (_label, call) => {
      const check = call.chunk.indexOf("requireAal2(context.claims");
      const rpc = call.chunk.indexOf(`"${call.fn}"`);
      expect(check, "sem requireAal2").toBeGreaterThan(-1);
      expect(check).toBeLessThan(rpc);
    },
  );

  it("a base exige aal2 em INSERT, UPDATE e DELETE das tabelas de dinheiro", () => {
    const sql = readFileSync(
      resolve(REPO, "supabase/migrations/20260930190000_money_writes_require_mfa.sql"),
      "utf8",
    );
    for (const cmd of ["INSERT", "UPDATE", "DELETE"]) {
      expect(sql).toMatch(new RegExp(`AS RESTRICTIVE '\\s*'FOR ${cmd} TO authenticated`));
    }
    for (const table of [
      "hr_contracts",
      "hr_payroll_runs",
      "hr_payroll_payment_batches",
      "hr_payment_destinations",
      "school_billing_settings",
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
  });

  it("o retrato da produção tem as três restritivas em cada tabela de dinheiro", () => {
    const snapshot = JSON.parse(
      readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
    ) as { politicas: Array<{ tabela: string; cmd: string; modo?: string; politica: string }> };
    const sql = readFileSync(
      resolve(REPO, "supabase/migrations/20260930190000_money_writes_require_mfa.sql"),
      "utf8",
    );
    const tables = [...sql.matchAll(/^\s*'([a-z_]+)',?$/gm)].map((m) => m[1]!);
    expect(tables.length).toBe(12);
    for (const table of tables) {
      const cmds = snapshot.politicas
        .filter((p) => p.tabela === table && p.modo === "RESTRICTIVE")
        .filter((p) => p.politica.startsWith("Money writes require MFA"))
        .map((p) => p.cmd)
        .sort();
      expect(cmds, table).toEqual(["DELETE", "INSERT", "UPDATE"]);
    }
  });
});

describe("papel do RH pela escola da linha (20260930200000)", () => {
  const snapshot = JSON.parse(
    readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
  ) as {
    politicas: Array<{ tabela: string; politica: string; usando: string; verificando: string }>;
  };

  it("nenhuma política do RH ou da faturação compara current_profile_role()", () => {
    // Devolve o código (owner, treasury); as políticas comparavam com nomes e nunca
    // coincidiam: o RH não funcionava para ninguém.
    const legacy = snapshot.politicas
      .filter((p) => p.tabela.startsWith("hr_") || p.tabela === "school_billing_settings")
      .filter((p) => /current_profile_role\(\)/.test(`${p.usando} ${p.verificando}`))
      .map((p) => `${p.tabela}: ${p.politica}`);
    expect(legacy).toEqual([]);
  });

  it("sga_app_role(school_id) numa política vai sempre com is_school_member(school_id)", () => {
    // Para quem não é membro da escola, sga_app_role devolve o cargo global do perfil:
    // sem a verificação de membro, um Administrador de outra escola passaria.
    const unguarded = snapshot.politicas
      .filter((p) => {
        const expr = `${p.usando} ${p.verificando}`;
        return (
          /sga_app_role\(school_id\)/.test(expr) &&
          // `user_member_school_ids()` é o mesmo teste (membro activo) escrito para o planeador
          // avaliar uma só vez; a produção reescreveu assim as políticas a 04/10.
          !/is_school_member\(school_id\)|user_member_school_ids\(\)/.test(expr)
        );
      })
      .map((p) => `${p.tabela}: ${p.politica}`);
    expect(snapshot.politicas.some((p) => /sga_app_role\(school_id\)/.test(p.usando))).toBe(true);
    expect(unguarded).toEqual([]);
  });
});
