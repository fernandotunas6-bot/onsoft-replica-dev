import { describe, expect, it, vi } from "vitest";
import {
  evaluateFinanceInventory,
  financeReadOnlyRequest,
  readFinanceInventory,
  type FinanceInventory,
} from "../../scripts/siga/check-finance-schema-drift.mjs";

const productionObservation: FinanceInventory = {
  cash_points: true,
  cash_sessions: true,
  cash_history: false,
  receipt_cash_trigger: true,
  expense_cash_trigger: true,
  idempotency_column: false,
  idempotency_index: false,
  payment_rpc_six_args: false,
  reversal_mentions_penalty: false,
};

describe("inventário de migrações financeiras — leitura exclusiva", () => {
  it("bloqueia a combinação observada: caixa fora do histórico e financeiro pendente", () => {
    const report = evaluateFinanceInventory(productionObservation);
    expect(report.blocked).toBe(true);
    expect(report.blockers.join(" ")).toContain("20261024110000");
    expect(report.pending.join(" ")).toContain("Idempotência");
    expect(report.pending.join(" ")).toContain("penalty_amount");
    expect(report.caveat).toContain("staging");
  });

  it("bloqueia esquema de caixa parcial e migração de idempotência parcial", () => {
    const report = evaluateFinanceInventory({
      ...productionObservation,
      cash_sessions: false,
      idempotency_column: true,
    });
    expect(report.blockers.join(" ")).toContain("Esquema de caixa parcial");
    expect(report.blockers.join(" ")).toContain("idempotência aplicada parcialmente");
  });

  it("não confunde indicadores coerentes com homologação ou publicação", () => {
    const report = evaluateFinanceInventory({
      ...productionObservation,
      cash_history: true,
      idempotency_column: true,
      idempotency_index: true,
      payment_rpc_six_args: true,
      reversal_mentions_penalty: true,
    });
    expect(report.blocked).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.pending).toEqual([]);
    expect(report.caveat).toContain("E2E");
  });

  it("não aceita inventários parciais ou respostas imprevistas", () => {
    expect(() => evaluateFinanceInventory(null)).toThrow(/incompleto/);
    expect(() => evaluateFinanceInventory({ cash_points: true })).toThrow(/incompleto/);
  });

  it("usa exclusivamente o endpoint do utilizador read-only, com SQL fixa", async () => {
    const request = financeReadOnlyRequest();
    expect(Object.keys(request)).toEqual(["query"]);
    expect(request.query.trim()).toMatch(/^SELECT\b/i);
    expect(request.query).not.toMatch(/\b(?:DELETE|INSERT|UPDATE|DROP|ALTER|TRUNCATE)\s/i);
    expect(request.query).toContain("pg_catalog.pg_trigger");
    expect(request.query).toContain("pg_catalog.pg_proc");

    const send = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => [productionObservation],
    }));
    const data = await readFinanceInventory(
      "abcde12345abcde12345",
      "testing-token-only",
      send as unknown as typeof fetch,
    );
    expect(data.cash_history).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe(
      "https://api.supabase.com/v1/projects/abcde12345abcde12345/database/query/read-only",
    );
    expect(JSON.parse(String(init?.body))).toEqual({ query: request.query });
    expect(init?.method).toBe("POST");
  });

  it("falha fechado sem token ou em HTTP de erro sem expor a resposta", async () => {
    const send = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ message: "credential-do-not-print" }),
    }));
    await expect(
      readFinanceInventory("abcde12345abcde12345", "", send as unknown as typeof fetch),
    ).rejects.toThrow(/obrigatórios/);
    await expect(
      readFinanceInventory("abcde12345abcde12345", "secret", send as unknown as typeof fetch),
    ).rejects.toThrow("HTTP 403");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
