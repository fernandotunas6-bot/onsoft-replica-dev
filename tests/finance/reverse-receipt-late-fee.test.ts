import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O estorno e o pagamento têm de medir a fatura da mesma maneira. O estorno
 * comparava os recibos restantes com `valor - desconto`, sem a multa que
 * `register_payment` cobra, e podia fechar como «paga» uma fatura com dívida.
 */
const dir = join(process.cwd(), "supabase/migrations");

function ultimaDefinicao(funcao: string): string {
  const ficheiro = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      new RegExp(`FUNCTION\\s+private\\.${funcao}\\s*\\(`, "i").test(
        readFileSync(join(dir, f), "utf8"),
      ),
    )
    .at(-1);
  expect(ficheiro, `nenhuma migração define private.${funcao}`).toBeDefined();
  return readFileSync(join(dir, ficheiro!), "utf8");
}

describe("estorno de recibo", () => {
  it("conta a multa por atraso no total da fatura, como register_payment", () => {
    const sql = ultimaDefinicao("reverse_finance_receipt");
    const net = sql.match(/v_net\s*:=\s*([^;]+);/)?.[1] ?? "";
    expect(net).toMatch(/penalty_amount/);
    expect(net).toMatch(/discount_amount/);
  });
});
