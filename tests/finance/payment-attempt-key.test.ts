// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePaymentAttemptKey } from "@/features/finance/use-payment-attempt-key";

describe("chave de tentativa de pagamento", () => {
  it("repetir o mesmo pagamento reenvia a mesma chave", () => {
    const { result } = renderHook(() => usePaymentAttemptKey());
    const a = result.current.keyFor("fatura-1|5000|cash|2026-10-24");
    expect(result.current.keyFor("fatura-1|5000|cash|2026-10-24")).toBe(a);
  });

  it("outro valor ou outra fatura é outro pagamento", () => {
    const { result } = renderHook(() => usePaymentAttemptKey());
    const a = result.current.keyFor("fatura-1|5000|cash|");
    expect(result.current.keyFor("fatura-1|5500|cash|")).not.toBe(a);
    expect(result.current.keyFor("fatura-2|5000|cash|")).not.toBe(a);
  });

  it("depois de aceite, a mesma prestação seguinte recebe chave nova", () => {
    const { result } = renderHook(() => usePaymentAttemptKey());
    const a = result.current.keyFor("fatura-1|5000|cash|");
    result.current.settled("fatura-1|5000|cash|");
    expect(result.current.keyFor("fatura-1|5000|cash|")).not.toBe(a);
  });
});

describe("migração da chave de idempotência", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261024100000_register_payment_idempotency_key.sql"),
    "utf8",
  );

  it("tranca a fatura antes de procurar a chave e recusa reutilizá-la noutro pagamento", () => {
    const bloco = sql.slice(sql.indexOf("if target_idempotency_key is not null"));
    expect(bloco.indexOf("for update")).toBeLessThan(
      bloco.indexOf("idempotency_key = target_idempotency_key"),
    );
    expect(sql).toMatch(/já foi usada noutro pagamento/);
    expect(sql).toMatch(/UNIQUE INDEX[^;]+\(school_id, idempotency_key\)/);
  });

  it("não deixa a função nova aberta ao anon", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.register_payment\([^)]+\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.register_payment\([^)]+\) FROM PUBLIC, anon/,
    );
  });
});
