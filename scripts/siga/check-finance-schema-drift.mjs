#!/usr/bin/env node
/**
 * Inventário financeiro remoto, só de leitura. Não aplica migrações nem altera
 * schema_migrations. Exige projecto explícito e token só no servidor.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/siga/check-finance-schema-drift.mjs --project-ref=<ref>
 *
 * Endpoint exclusivamente read-only do Supabase: /database/query/read-only.
 * A query é fixa; NÃO usar o endpoint genérico /database/query.
 * Mesmo sem divergências, a saída NÃO substitui staging, diff DDL ou E2E.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FINANCE_INVENTORY_SQL = `
SELECT
  pg_catalog.to_regclass('public.finance_cash_points') IS NOT NULL AS cash_points,
  pg_catalog.to_regclass('public.finance_cash_sessions') IS NOT NULL AS cash_sessions,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024110000') AS cash_history,
  EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname='finance_receipts_cash_session' AND NOT tgisinternal) AS receipt_cash_trigger,
  EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname='siga_cash_expenses_cash_session' AND NOT tgisinternal) AS expense_cash_trigger,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_receipts' AND column_name='idempotency_key') AS idempotency_column,
  pg_catalog.to_regclass('public.finance_receipts_school_idempotency_key') IS NOT NULL AS idempotency_index,
  EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='register_payment' AND p.pronargs=6) AS payment_rpc_six_args,
  EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='reverse_finance_receipt' AND position('v_invoice.penalty_amount' IN pg_catalog.pg_get_functiondef(p.oid)) > 0) AS reversal_mentions_penalty;
`;

const KEYS = [
  "cash_points",
  "cash_sessions",
  "cash_history",
  "receipt_cash_trigger",
  "expense_cash_trigger",
  "idempotency_column",
  "idempotency_index",
  "payment_rpc_six_args",
  "reversal_mentions_penalty",
];

export function financeReadOnlyRequest() {
  return { query: FINANCE_INVENTORY_SQL };
}

/** Reporta inconsistências, não deduz autorização de deploy de uma tabela existente. */
export function evaluateFinanceInventory(row) {
  if (!row || KEYS.some((key) => typeof row[key] !== "boolean")) {
    throw new Error("Inventário financeiro incompleto: nenhuma conclusão é segura.");
  }
  const blockers = [];
  const pending = [];

  if (row.cash_points !== row.cash_sessions) {
    blockers.push("Esquema de caixa parcial: as duas tabelas devem estar presentes em conjunto.");
  }
  if (row.cash_points && !row.cash_history) {
    blockers.push(
      "Caixa existe sem versão 20261024110000 no histórico: reconciliar DDL e migrações.",
    );
  }
  if (row.cash_history && !row.cash_points) {
    blockers.push("Histórico declara a migração de caixa, mas as tabelas não existem.");
  }
  if (row.cash_points && (!row.receipt_cash_trigger || !row.expense_cash_trigger)) {
    blockers.push("Caixa instalado com gatilhos de movimentos incompletos.");
  }
  if (!row.cash_points && (row.receipt_cash_trigger || row.expense_cash_trigger)) {
    blockers.push("Gatilhos de caixa presentes sem as tabelas correspondentes.");
  }

  const paymentParts = [row.idempotency_column, row.idempotency_index, row.payment_rpc_six_args];
  if (paymentParts.some(Boolean) && !paymentParts.every(Boolean)) {
    blockers.push("Migração de idempotência aplicada parcialmente: coluna, índice e RPC divergem.");
  } else if (!paymentParts.every(Boolean)) {
    pending.push("Idempotência do pagamento ainda não identificada (PR #276).");
  }
  if (!row.reversal_mentions_penalty) {
    pending.push("A função de estorno não referencia penalty_amount: rever PR #276.");
  }
  if (!row.cash_points) {
    pending.push("Sessões de caixa ainda não identificadas neste projecto (PR #283).");
  }

  return {
    blocked: blockers.length > 0 || pending.length > 0,
    blockers,
    pending,
    caveat:
      "Inventário indicativo; conferir DDL, permissões, histórico e E2E em staging antes de publicar.",
  };
}

function readProjectRef(args) {
  if (args.length !== 1 || !args[0].startsWith("--project-ref=")) {
    throw new Error("Indique explicitamente --project-ref=<referência do projecto>.");
  }
  const ref = args[0].slice("--project-ref=".length);
  if (!/^[a-z0-9]{20}$/.test(ref)) {
    throw new Error("A referência do projecto Supabase é inválida.");
  }
  return ref;
}

export async function readFinanceInventory(projectRef, token, send = fetch) {
  if (!/^[a-z0-9]{20}$/.test(projectRef) || !String(token ?? "").trim()) {
    throw new Error("Projecto e token Supabase explícitos são obrigatórios.");
  }
  const result = await send(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(financeReadOnlyRequest()),
    },
  );
  if (!result.ok) {
    // A resposta do fornecedor pode conter dados sensíveis: não a imprimir.
    throw new Error(`Consulta de inventário recusada (HTTP ${result.status}).`);
  }
  const payload = await result.json();
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rows)
      ? payload.rows
      : null;
  if (!rows || rows.length !== 1) {
    throw new Error("Formato inesperado da resposta de inventário.");
  }
  return rows[0];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const ref = readProjectRef(process.argv.slice(2));
    const row = await readFinanceInventory(ref, process.env.SUPABASE_ACCESS_TOKEN);
    const audit = evaluateFinanceInventory(row);
    for (const item of audit.blockers) console.error(`BLOQUEADO: ${item}`);
    for (const item of audit.pending) console.error(`PENDENTE: ${item}`);
    console.log(audit.caveat);
    if (audit.blocked) process.exitCode = 1;
    else console.log("Inventário sem divergências nos indicadores verificados.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Não foi possível auditar o esquema.");
    process.exitCode = 1;
  }
}
