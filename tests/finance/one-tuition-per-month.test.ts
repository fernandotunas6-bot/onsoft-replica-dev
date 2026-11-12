import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

/**
 * `issueInvoice` verifica e insere em dois passos; duas emissões em paralelo passavam
 * as duas. A base passa a garantir uma propina por contrato e por mês.
 */
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261025090000_one_tuition_invoice_per_month.sql"),
  "utf8",
);

describe("uma propina por aluno e por mês", () => {
  it("tranca o par contrato-mês antes de procurar a outra propina", () => {
    const corpo = sql.slice(sql.indexOf("AS $function$"));
    expect(corpo.indexOf("pg_advisory_xact_lock")).toBeGreaterThan(0);
    expect(corpo.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      corpo.indexOf("from public.finance_invoices i"),
    );
  });

  it("só conta propinas não anuladas, e só actua em inserções", () => {
    expect(sql).toMatch(/f\.kind = 'tuition'/);
    expect(sql).toMatch(/i\.status <> 'cancelled'/);
    expect(sql).toMatch(/BEFORE INSERT ON public\.finance_invoices/);
  });

  it("fecha a função ao anon", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.finance_invoice_one_tuition_per_month\(\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it("a recusa da base chega ao ecrã com a mensagem, não como erro genérico", () => {
    const mensagem = "Este aluno já tem a propina deste mês. Anule-a antes de emitir outra.";
    expect(sql).toContain(mensagem);
    expect(
      publicDatabaseError({ code: "22023", message: mensagem }, "Não foi possível emitir a fatura.")
        .message,
    ).toBe(mensagem);
  });
});
