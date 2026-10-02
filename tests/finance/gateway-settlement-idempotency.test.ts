import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { settleGatewayPayment } from "@/features/finance/gateway-webhook-handler";

type ErroPg = { code?: string; message: string; details?: string };

type Cenario = {
  fatura: { id: string; status: string; amount: number; issued_by: string | null } | null;
  /** Eventos de webhook já liquidados com sucesso, por external_id. */
  eventosOk: string[];
  /** Recibos emitidos para a fatura. */
  recibosEmitidos: Array<{ amount: number }>;
  /** Erros a devolver no insert de recibo, na ordem das tentativas. */
  errosNoInsert: Array<ErroPg | null>;
  /** Utilizador activo da escola, ou null se a escola não tiver nenhum. */
  membroDaEscola: string | null;
};

const cenario: Cenario = {
  fatura: null,
  eventosOk: [],
  recibosEmitidos: [],
  errosNoInsert: [],
  membroDaEscola: "membro-da-escola",
};

const inserts: Array<Record<string, unknown>> = [];
const consultas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];

/** Encadeável e "thenable": serve tanto `.maybeSingle()` como um `await` directo. */
function cadeia(tabela: string, resolver: (filtros: Array<[string, unknown]>) => unknown) {
  const filtros: Array<[string, unknown]> = [];
  const alvo: Record<string, unknown> = {};
  const passa = () => alvo;
  for (const metodo of ["select", "eq", "neq", "in", "like", "limit", "order", "not"]) {
    alvo[metodo] = (coluna?: unknown, valor?: unknown) => {
      if (metodo === "eq" || metodo === "like") filtros.push([String(coluna), valor]);
      return passa();
    };
  }
  alvo["maybeSingle"] = () => {
    consultas.push({ tabela, filtros });
    return Promise.resolve(resolver(filtros));
  };
  alvo["single"] = alvo["maybeSingle"];
  alvo["then"] = (r: (v: unknown) => unknown) => {
    consultas.push({ tabela, filtros });
    return r(resolver(filtros));
  };
  return alvo;
}

function construirDb(): SupabaseClient {
  let tentativaInsert = 0;
  let proximoNumeroRecibo = 1;
  return {
    rpc: async (nome: string) => {
      if (nome === "next_document_number_service") {
        const numero = `REC-${String(proximoNumeroRecibo).padStart(4, "0")}`;
        proximoNumeroRecibo += 1;
        return { data: numero, error: null };
      }
      // Base sem a liquidação atómica (20261002090137), ex.: ambiente local:
      // estes testes cobrem o caminho em passos que corre até lá.
      if (nome === "settle_gateway_payment_service") {
        return {
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        };
      }
      // Um webhook servidor-a-servidor tem auth.uid() nulo: register_payment levanta
      // sempre 42501 e o caminho real é o fallback. É esse que estamos a testar.
      return {
        data: null,
        error: { code: "42501", message: "Sem autorização para registar pagamentos." },
      };
    },
    from: (tabela: string) => ({
      select: (_cols?: unknown, opcoes?: { count?: string; head?: boolean }) => {
        if (tabela === "finance_invoices") {
          return cadeia(tabela, () => ({ data: cenario.fatura, error: null }));
        }
        if (tabela === "finance_gateway_webhook_events") {
          return cadeia(tabela, (filtros) => {
            const externo = filtros.find(([c]) => c === "external_id")?.[1];
            const achou = cenario.eventosOk.includes(String(externo));
            return { data: achou ? { id: "evt-1", invoice_id: "inv-1" } : null, error: null };
          });
        }
        if (tabela === "finance_receipts") {
          if (opcoes?.count) {
            return cadeia(tabela, () => ({ count: cenario.recibosEmitidos.length, error: null }));
          }
          return cadeia(tabela, () => ({ data: cenario.recibosEmitidos, error: null }));
        }
        if (tabela === "school_memberships") {
          return cadeia(tabela, (filtros) => {
            const temEscola = filtros.some(([coluna]) => coluna === "school_id");
            if (!temEscola) {
              // O recurso sem filtro de escola que existia antes. Devolver aqui um
              // utilizador de outra instituição torna o defeito visível no teste.
              return { data: { user_id: "membro-de-OUTRA-escola" }, error: null };
            }
            return {
              data: cenario.membroDaEscola ? { user_id: cenario.membroDaEscola } : null,
              error: null,
            };
          });
        }
        return cadeia(tabela, () => ({ data: null, error: null }));
      },
      insert: (linha: Record<string, unknown>) => {
        inserts.push({ ...linha, __tabela: tabela });
        const erro = cenario.errosNoInsert[tentativaInsert] ?? null;
        tentativaInsert += 1;
        return cadeia(tabela, () =>
          erro ? { data: null, error: erro } : { data: { id: "rec-novo" }, error: null },
        );
      },
      update: () => cadeia(tabela, () => ({ data: [], error: null })),
    }),
  } as unknown as SupabaseClient;
}

function liquidar(extra: Partial<Parameters<typeof settleGatewayPayment>[1]> = {}) {
  return settleGatewayPayment(construirDb(), {
    schoolId: "school-1",
    invoiceId: "inv-1",
    amount: 20_000,
    method: "multicaixa",
    reference: "123456789",
    externalId: "TX-ABC-1",
    ...extra,
  });
}

describe("idempotência da liquidação de gateway", () => {
  beforeEach(() => {
    inserts.length = 0;
    consultas.length = 0;
    cenario.fatura = { id: "inv-1", status: "open", amount: 45_000, issued_by: "user-tesouraria" };
    cenario.eventosOk = [];
    cenario.recibosEmitidos = [];
    cenario.errosNoInsert = [];
    cenario.membroDaEscola = "membro-da-escola";
  });

  it("recusa reenvio numa fatura PARCIALMENTE paga — o caso que passava", async () => {
    cenario.fatura = {
      id: "inv-1",
      status: "partially_paid",
      amount: 45_000,
      issued_by: "user-tesouraria",
    };
    cenario.recibosEmitidos = [{ amount: 20_000 }];
    cenario.eventosOk = ["TX-ABC-1"];

    const resultado = await liquidar();

    expect(resultado.alreadyPaid).toBe(true);
    expect(inserts, "não pode emitir um segundo recibo para a mesma transação").toHaveLength(0);
  });

  it("deixa passar uma segunda prestação legítima, com transação diferente", async () => {
    cenario.fatura = {
      id: "inv-1",
      status: "partially_paid",
      amount: 45_000,
      issued_by: "user-tesouraria",
    };
    cenario.recibosEmitidos = [{ amount: 20_000 }];
    cenario.eventosOk = ["TX-ABC-1"];

    const resultado = await liquidar({ externalId: "TX-ABC-2" });

    expect(resultado.alreadyPaid).toBe(false);
    expect(inserts).toHaveLength(1);
  });

  it("recusa pagamento que excede o saldo em aberto", async () => {
    cenario.recibosEmitidos = [{ amount: 30_000 }];

    await expect(liquidar({ amount: 20_000 })).rejects.toThrow(/excede o saldo em aberto/i);
    expect(inserts).toHaveLength(0);
  });

  it("trata colisão no índice de idempotência como já liquidado, e não como número ocupado", async () => {
    cenario.errosNoInsert = [
      {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "finance_receipts_school_external_id_key"',
        details: "Key (school_id, external_id) already exists.",
      },
    ];

    const resultado = await liquidar();

    expect(resultado.alreadyPaid).toBe(true);
    expect(inserts, "não pode tentar outro número de recibo para a mesma transação").toHaveLength(
      1,
    );
  });

  it("continua a avançar o número quando a colisão é mesmo no número do recibo", async () => {
    cenario.errosNoInsert = [
      {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "finance_receipts_school_id_receipt_number_key"',
        details: "Key (school_id, receipt_number) already exists.",
      },
      null,
    ];

    const resultado = await liquidar();

    expect(resultado.alreadyPaid).toBe(false);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]!["receipt_number"]).not.toBe(inserts[1]!["receipt_number"]);
  });

  it("repete sem external_id enquanto a migração não estiver aplicada", async () => {
    cenario.errosNoInsert = [
      {
        code: "42703",
        message: 'column "external_id" of relation "finance_receipts" does not exist',
      },
      null,
    ];

    const resultado = await liquidar();

    expect(resultado.alreadyPaid).toBe(false);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toHaveProperty("external_id", "TX-ABC-1");
    expect(inserts[1], "a segunda tentativa vai sem a coluna").not.toHaveProperty("external_id");
  });

  it("atribui o recibo a um membro da própria escola quando a fatura não tem emissor", async () => {
    cenario.fatura = { id: "inv-1", status: "open", amount: 45_000, issued_by: null };

    await liquidar();

    expect(inserts[0]!["received_by"]).toBe("membro-da-escola");
  });

  it("recusa em vez de atribuir o recibo a alguém de outra escola", async () => {
    cenario.fatura = { id: "inv-1", status: "open", amount: 45_000, issued_by: null };
    cenario.membroDaEscola = null;

    await expect(liquidar()).rejects.toThrow(/responsável nesta escola/i);

    const procuras = consultas.filter((c) => c.tabela === "school_memberships");
    for (const procura of procuras) {
      expect(
        procura.filtros.map(([coluna]) => coluna),
        "nenhuma procura de membro pode correr sem filtro de escola",
      ).toContain("school_id");
    }
    expect(inserts, "sem responsável identificável não se emite recibo").toHaveLength(0);
  });
});
