import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

/**
 * As duas funções da base que mexem em dinheiro — `private.register_payment` e
 * `private.reverse_receipt` — fazem, cada uma, cinco coisas que o TypeScript não
 * consegue garantir sozinho: exigem 2FA, exigem a permissão granular
 * (`finance.payments.create` / `.reverse`), trancam a linha com `FOR UPDATE`, validam o
 * saldo, e recalculam o estado da fatura.
 *
 * Contornar qualquer uma delas com um `UPDATE` directo perde as cinco de uma vez. Foi o
 * que aconteceu com `reverseCashEntry`, que estornava o recibo à mão e deixava a fatura
 * em `paid` sem recibos activos — o aluno devia dinheiro que o sistema dava por liquidado,
 * e a fatura já não aceitava novo pagamento.
 *
 * Este teste trava o regresso desse padrão.
 */

const REPO = resolve(__dirname, "../..");
const RAIZ = resolve(REPO, "src");

/**
 * Únicos sítios onde escrever directamente em `finance_receipts` é legítimo, com a razão.
 * Acrescentar uma entrada aqui deve exigir a mesma justificação.
 */
const EXCEPCOES_ESTORNO = [
  {
    ficheiro: "src/features/finance/payflow-settlement.ts",
    porque:
      "webhook servidor-a-servidor: auth.uid() é nulo, logo reverse_receipt levanta " +
      "sempre 42501. Reproduz o cálculo de estado da fatura que a RPC faria.",
  },
  {
    ficheiro: "src/features/finance/gateway-webhook-handler.ts",
    porque:
      "mesma razão — é o fallback de liquidação do gateway, que não tem sessão " +
      "interactiva para satisfazer register_payment.",
  },
];

function ficheirosTs(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = resolve(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      ficheirosTs(caminho, acc);
    } else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      acc.push(caminho);
    }
  }
  return acc;
}

const ficheiros = ficheirosTs(RAIZ).map((caminho) => ({
  caminho: relative(REPO, caminho),
  fonte: readFileSync(caminho, "utf8"),
}));

describe("movimentos de dinheiro passam pelas funções da base", () => {
  it("nenhum ficheiro novo estorna recibos com UPDATE directo", () => {
    const permitidos = new Set(EXCEPCOES_ESTORNO.map((e) => e.ficheiro));

    const infractores = ficheiros
      .filter(({ caminho }) => !permitidos.has(caminho))
      .filter(({ fonte }) => {
        // A janela vai de `.from("finance_receipts")` até ao `.from(` seguinte — sem isso,
        // um `.select()` sobre recibos seguido de um `.update()` sobre OUTRA tabela com
        // `status: "reversed"` dava falso positivo.
        const trechos = fonte.split('from("finance_receipts")').slice(1);
        return trechos.some((trecho) => {
          const fim = trecho.indexOf(".from(");
          const cadeia = fim === -1 ? trecho : trecho.slice(0, fim);
          return /\.update\(/.test(cadeia) && /status:\s*"reversed"/.test(cadeia);
        });
      })
      .map(({ caminho }) => caminho);

    expect(
      infractores,
      "use a RPC reverse_receipt (client da sessão), ou justifique a excepção neste teste",
    ).toEqual([]);
  });

  it("reverseCashEntry chama reverse_receipt", () => {
    const servidor = ficheiros.find(
      ({ caminho }) => caminho === "src/features/finance/server.ts",
    )!;
    const bloco = servidor.fonte.slice(
      servidor.fonte.indexOf("export const reverseCashEntry"),
      servidor.fonte.indexOf("export const createPaymentPlan"),
    );

    expect(bloco, "o bloco de reverseCashEntry não foi encontrado").not.toHaveLength(0);
    expect(bloco).toContain('rpc("reverse_receipt"');
    // A intenção, não a grafia: a RPC tem de sair do client da SESSÃO, porque
    // `reverse_receipt` exige `auth.uid()` e `is_aal2()`. Pelo client de serviço
    // (`loadSgaAdminClient`) nenhum dos dois resolve e a função recusa sempre.
    expect(
      bloco,
      "a RPC tem de correr no client da sessão para auth.uid()/is_aal2 resolverem",
    ).toContain("context.supabase.rpc");
    expect(
      bloco.includes("db.rpc("),
      "o client de serviço não serve para estornar: auth.uid() é nulo",
    ).toBe(false);
  });

  it("recordInvoicePayment continua a chamar register_payment na sessão", () => {
    const servidor = ficheiros.find(
      ({ caminho }) => caminho === "src/features/finance/server.ts",
    )!;
    const bloco = servidor.fonte.slice(
      servidor.fonte.indexOf("export const recordInvoicePayment"),
      servidor.fonte.indexOf("export const generateInvoicePaymentReference"),
    );

    expect(bloco).toContain('context.supabase.rpc("register_payment"');
  });
});
