import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  summarizeCashSessions,
  type ClosedSessionRow,
} from "@/features/finance/cash-session-report";

const session = (over: Partial<ClosedSessionRow> = {}): ClosedSessionRow => ({
  id: "s1",
  opened_at: "2026-10-24T07:00:00Z",
  closed_at: "2026-10-24T17:00:00Z",
  opening_float: "1000.00",
  expected_cash: "2500.00",
  counted_cash: "2500.00",
  difference: "0.00",
  difference_reason: null,
  approved_at: null,
  ...over,
});

describe("relatório de fecho de caixa", () => {
  it("entradas são recibos e despesas estornadas; saídas são despesas e recibos estornados", () => {
    // 1000 + 6400 − 3900 = 3500, o que a base gravou no fecho.
    const [r] = summarizeCashSessions([session({ expected_cash: 3500, counted_cash: 3500 })], {
      receipts: [
        { session_id: "s1", amount: "5000.00" },
        { session_id: "s1", amount: 400 },
        { session_id: "outra", amount: 99999 },
      ],
      reversedReceipts: [{ session_id: "s1", amount: 400 }],
      expenses: [
        { session_id: "s1", amount: 1500 },
        { session_id: "s1", amount: 2000 },
      ],
      reversedExpenses: [{ session_id: "s1", amount: 1000 }],
    });
    expect(r).toMatchObject({
      openingFloat: 1000,
      cashIn: 6400,
      cashOut: 3900,
      expectedCash: 3500,
      countedCash: 3500,
      state: "balanced",
      consistent: true,
    });
  });

  it("diferença por aprovar e aprovada; o motivo segue", () => {
    const [porAprovar, aprovada] = summarizeCashSessions(
      [
        session({ id: "a", counted_cash: 0, difference: "-2500.00", difference_reason: "Troco" }),
        session({ id: "b", difference: 100, approved_at: "2026-10-25T08:00:00Z" }),
      ],
      { receipts: [], reversedReceipts: [], expenses: [], reversedExpenses: [] },
    );
    expect(porAprovar).toMatchObject({ state: "pending", difference: -2500, reason: "Troco" });
    expect(aprovada!.state).toBe("approved");
  });

  it("os depósitos no banco contam à parte e entram na conta do esperado", () => {
    const [r] = summarizeCashSessions([session({ expected_cash: 1500, counted_cash: 1500 })], {
      receipts: [{ session_id: "s1", amount: 9000 }],
      reversedReceipts: [],
      expenses: [],
      reversedExpenses: [],
      deposits: [
        { session_id: "s1", amount: "8000.00" },
        { session_id: "s1", amount: 500 },
      ],
    });
    expect(r).toMatchObject({ cashIn: 9000, cashOut: 0, deposits: 8500, consistent: true });
  });

  it("movimentos que não somam o esperado gravado ficam assinalados", () => {
    const [r] = summarizeCashSessions([session({ expected_cash: 1000 })], {
      receipts: [{ session_id: "s1", amount: 0.1 }],
      reversedReceipts: [],
      expenses: [],
      reversedExpenses: [],
    });
    expect(r!.consistent).toBe(false);
    const [certo] = summarizeCashSessions([session({ expected_cash: "1000.30" })], {
      receipts: [
        { session_id: "s1", amount: 0.1 },
        { session_id: "s1", amount: 0.2 },
      ],
      reversedReceipts: [],
      expenses: [],
      reversedExpenses: [],
    });
    expect(certo!.consistent, "0,1 + 0,2 em cêntimos").toBe(true);
  });

  it("a Tesouraria mostra os fechos, e a leitura filtra a escola", () => {
    const rota = readFileSync(join(process.cwd(), "src/routes/tesouraria.tsx"), "utf8");
    expect(rota).toMatch(/<CashClosingsPanel \/>/);
    const servidor = readFileSync(
      join(process.cwd(), "src/features/finance/cash-session.functions.ts"),
      "utf8",
    );
    const fn = servidor.slice(servidor.indexOf("export const listCashSessionReports"));
    // Cada leitura (sessões, movimentos, depósitos) filtra a escola.
    const fim = fn.indexOf("\nconst ", 1);
    const corpo = fim > 0 ? fn.slice(0, fim) : fn;
    expect(corpo.match(/\.eq\("school_id", schoolId\)/g)?.length).toBe(
      corpo.match(/\.from\(/g)?.length,
    );
    expect(fn).toMatch(/requireSgaWriterFor\("financeiro"/);
  });
});
