import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listInvoicesInputSchema } from "@/features/finance/schemas";

/**
 * A lista trazia só as 250 faturas mais recentes, e os filtros corriam no navegador
 * sobre essas: numa escola com mais, as vencidas antigas não apareciam em «Vencida» nem
 * se podiam receber em Faturas ou em Caixa.
 */
const server = readFileSync(join(process.cwd(), "src/features/finance/server.ts"), "utf8");
const lista = server.slice(
  server.indexOf("export const listInvoices"),
  server.indexOf("export const listCashEntries"),
);

describe("faturas por pagar na lista", () => {
  it("com includeOpen, lê todas as por pagar em páginas de 1000", () => {
    expect(lista).toMatch(/if \(data\.includeOpen && !studentContractIds\)/);
    expect(lista).toMatch(/\.in\("status", \["open", "partially_paid"\]\)/);
    expect(lista).toMatch(/\.range\(from, from \+ OPEN_INVOICES_PAGE - 1\)/);
  });

  it("Faturas e Caixa pedem-nas", () => {
    for (const rota of ["faturas.tsx", "financeiro.tsx"]) {
      const fonte = readFileSync(join(process.cwd(), "src/routes", rota), "utf8");
      expect(fonte, rota).toMatch(
        /listInvoices\(\{ data: \{ limit: 250, includeOpen: true \} \}\)/,
      );
    }
  });

  it("o esquema aceita o pedido sem mudar o tecto das recentes", () => {
    expect(listInvoicesInputSchema.parse({ limit: 250, includeOpen: true }).includeOpen).toBe(true);
    expect(() => listInvoicesInputSchema.parse({ limit: 251 })).toThrow();
  });
});
