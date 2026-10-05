import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatInvoiceNumber,
  invoiceYearForSchool,
  loadNextInvoiceSequence,
  nextInvoiceSequence,
} from "@/features/finance/invoice-numbering";

/**
 * Numeração FT-AAAA/NNNN. Em produção (2026-10-05) uma escola já tinha 3 faturas e o
 * maior número 0004: «contagem + 1» apontava para um número ocupado. Os importadores
 * começavam em 1 e falhavam em qualquer escola com 5 faturas no ano.
 */
describe("nextInvoiceSequence", () => {
  it("é o maior número do ano + 1, não a contagem + 1", () => {
    expect(nextInvoiceSequence(["FT-2026/0001", "FT-2026/0002", "FT-2026/0004"], 2026)).toBe(5);
  });

  it("ignora outros anos e números fora do formato", () => {
    expect(
      nextInvoiceSequence(["FT-2025/0900", "FT-2026/0007", "INV-123", null, undefined, ""], 2026),
    ).toBe(8);
  });

  it("sem faturas no ano começa em 1", () => {
    expect(nextInvoiceSequence([], 2026)).toBe(1);
    expect(nextInvoiceSequence(["FT-2025/0003"], 2026)).toBe(1);
  });

  it("compara números, não texto (10000 > 9999)", () => {
    expect(nextInvoiceSequence(["FT-2026/9999", "FT-2026/10000"], 2026)).toBe(10001);
  });

  it("aceita números importados com espaços ou minúsculas", () => {
    expect(nextInvoiceSequence([" ft-2026/0129 "], 2026)).toBe(130);
  });
});

describe("formatInvoiceNumber", () => {
  it("preenche com zeros até 4 dígitos", () => {
    expect(formatInvoiceNumber(2026, 7)).toBe("FT-2026/0007");
    expect(formatInvoiceNumber(2026, 12345)).toBe("FT-2026/12345");
  });
});

describe("invoiceYearForSchool", () => {
  it("usa a data de Luanda: 31/12 às 23:30 UTC já é o ano seguinte", () => {
    expect(invoiceYearForSchool(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
    expect(invoiceYearForSchool(new Date("2026-12-31T22:30:00Z"))).toBe(2026);
  });
});

describe("loadNextInvoiceSequence", () => {
  function fakeDb(numbers: string[]) {
    const calls: Array<[number, number]> = [];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            like: () => ({
              order: () => ({
                range: async (from: number, to: number) => {
                  calls.push([from, to]);
                  return {
                    data: numbers.slice(from, to + 1).map((invoice_number) => ({ invoice_number })),
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
      }),
    };
    return { db: db as unknown as SupabaseClient, calls };
  }

  it("lê todas as páginas: o maior número pode estar depois das primeiras 1000 linhas", async () => {
    const numbers = Array.from({ length: 2500 }, (_, i) => formatInvoiceNumber(2026, i + 1));
    const { db, calls } = fakeDb(numbers);
    await expect(loadNextInvoiceSequence(db, "escola", 2026)).resolves.toBe(2501);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("escola sem faturas no ano: 1, com um só pedido", async () => {
    const { db, calls } = fakeDb([]);
    await expect(loadNextInvoiceSequence(db, "escola", 2026)).resolves.toBe(1);
    expect(calls).toHaveLength(1);
  });
});
