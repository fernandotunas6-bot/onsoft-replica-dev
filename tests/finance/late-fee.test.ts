import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addDaysIso, lateFeeChannelOfLedgerMethod, lateFeeFor } from "@/features/finance/late-fee";
import { invoiceNetTotal } from "@/features/finance/invoice-settlement";
import { parseSettingsDomain } from "@/features/school/settings-domains";

/**
 * Multa por atraso, 2026-10-04: a tesouraria não a cobrava (nem a já gravada), o
 * webhook EMIS/Unitel cobrava, a referência do ecrã e o AppyPay pediam o valor sem ela.
 * Agora há uma regra (late-fee.ts, igual a private.late_fee_due) e um total a pagar
 * (invoiceNetTotal). O ensaio tests/sql/late-fee.mjs compara as duas regras na base.
 */
const rule = (value: unknown) => parseSettingsDomain("billing", value);
const invoice = { amount: 15000, due_date: "2026-09-10", penalty_amount: 0 };
const twoPercent = rule({ late_fee_percent: 2, grace_days: 5 });

describe("multa por atraso: a regra", () => {
  it("sem regras gravadas não há multa", () => {
    expect(lateFeeFor(invoice, rule(undefined), "2027-01-01", "counter")).toBe(0);
  });

  it("a tolerância conta por datas: no último dia não há multa, no seguinte há", () => {
    expect(lateFeeFor(invoice, twoPercent, "2026-09-15", "counter")).toBe(0);
    expect(lateFeeFor(invoice, twoPercent, "2026-09-16", "counter")).toBe(300);
    expect(lateFeeFor(invoice, rule({ late_fee_percent: 2 }), "2026-09-10", "electronic")).toBe(0);
    expect(lateFeeFor(invoice, rule({ late_fee_percent: 2 }), "2026-09-11", "electronic")).toBe(
      300,
    );
  });

  it("aplica-se uma vez: a fatura que já tem multa não leva outra", () => {
    expect(
      lateFeeFor({ ...invoice, penalty_amount: 300 }, twoPercent, "2026-12-01", "counter"),
    ).toBe(0);
  });

  it("«só nos electrónicos»: numerário e transferência sem multa", () => {
    const electronic = rule({ late_fee_percent: 2, grace_days: 5, late_fee_scope: "electronic" });
    expect(lateFeeFor(invoice, electronic, "2026-10-01", "counter")).toBe(0);
    expect(lateFeeFor(invoice, electronic, "2026-10-01", "electronic")).toBe(300);
    expect(lateFeeChannelOfLedgerMethod("cash")).toBe("counter");
    expect(lateFeeChannelOfLedgerMethod("bank_transfer")).toBe("counter");
    expect(lateFeeChannelOfLedgerMethod("card")).toBe("electronic");
    expect(lateFeeChannelOfLedgerMethod("other")).toBe("electronic");
  });

  it("arredonda pelo decimal escrito, como o numeric do Postgres", () => {
    // 1.255 % arredonda a 1.26 % (Math.round(1.255 * 100) daria 125).
    const odd = rule({ late_fee_percent: 1.255 });
    expect(lateFeeFor({ ...invoice, amount: 333.33 }, odd, "2026-09-11", "counter")).toBe(4.2);
    expect(
      lateFeeFor(
        { ...invoice, amount: 0.05 },
        rule({ late_fee_percent: 10 }),
        "2026-09-11",
        "counter",
      ),
    ).toBe(0.01);
  });

  it("o total a pagar inclui a multa aplicada", () => {
    expect(invoiceNetTotal({ amount: 1000, discount_amount: 100, penalty_amount: 50 })).toBe(950);
    expect(invoiceNetTotal({ amount: 1000, discount_amount: 100 })).toBe(900);
  });

  it("soma dias atravessando meses e anos", () => {
    expect(addDaysIso("2026-12-30", 5)).toBe("2027-01-04");
    expect(addDaysIso("2026-02-27", 2)).toBe("2026-03-01");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("multa por atraso: todos os caminhos com a mesma regra", () => {
  it("referência EMIS, plano de pagamento, AppyPay e webhook pedem a multa de um pagamento hoje", () => {
    const server = readFileSync("src/features/finance/server.ts", "utf8");
    expect(server.match(/lateFeeFor\(\w+, billing, todayIso\(\), "electronic"\)/g)).toHaveLength(2);
    for (const file of [
      "src/features/finance/appypay.functions.ts",
      "src/features/finance/gateway-webhook-handler.ts",
    ]) {
      expect(readFileSync(file, "utf8"), file).toMatch(
        /lateFeeFor\(invoice, billing, todayIso\(\), "electronic"\)/,
      );
    }
  });

  it("a tesouraria aplica-a na base, com a mesma regra", () => {
    const sql = readFileSync("supabase/migrations/20261004140000_late_fee_one_rule.sql", "utf8");
    expect(sql).toContain("late_fee := private.late_fee_due(");
    expect(sql).toContain("return round(round(invoice_amount, 2) * fee_percent / 100, 2);");
    expect(sql).toContain("if payment_date <= invoice_due_date + grace_days then");
    expect(sql).toContain("not in ('card', 'other')");
    expect(sql).toMatch(/\+ coalesce\(selected_invoice\.penalty_amount, 0\)/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.late_fee_due[^;]*FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("o pacote do SQL Editor leva a migração tal como está, com a confirmação no fim", () => {
    const pacote = readFileSync("docs/agents/SIGA_aplicar_multas_atraso.sql", "utf8");
    expect(pacote).toContain(
      readFileSync("supabase/migrations/20261004140000_late_fee_one_rule.sql", "utf8"),
    );
    expect(pacote).toMatch(/══════════ Confirmar ══════════[\s\S]*private\.late_fee_due/);
  });

  it("nenhum total de fatura fica sem a multa, excepto o SAF-T da fatura emitida", () => {
    const withoutPenalty = [...sourceFiles("src/features"), ...sourceFiles("src/routes")].filter(
      (file) =>
        /Number\((\w+)\??\.amount \?\? 0\) - Number\(\1\??\.discount_amount \?\? 0\)/.test(
          readFileSync(file, "utf8"),
        ),
    );
    expect(withoutPenalty).toEqual(["src/features/finance/saft-export.ts"]);
  });
});
