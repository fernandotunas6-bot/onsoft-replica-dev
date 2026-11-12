import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAal2 } from "@/features/hr/require-aal2";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { dynamicTablesClient } from "@/integrations/supabase/sga";
import { schoolTodayIso } from "@/lib/school-date";
import {
  summarizeCashSessions,
  type CashSessionReport,
  type ClosedSessionRow,
  type SessionMovement,
} from "@/features/finance/cash-session-report";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";

/**
 * Sessões de caixa (docs/specs/finance/CAIXA_SESSOES.md). A abertura, o fecho e a
 * aprovação correm na sessão do utilizador, para `auth.uid()` e AAL2 resolverem nas
 * funções da base; a leitura do estado corre no servidor, como os outros
 * movimentos de caixa.
 *
 * As tabelas e funções são da migração 20261024110000, que os tipos gerados ainda
 * não conhecem: até se regerarem, passam por `dynamicTablesClient`.
 */

function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const TREASURY_ROLES = ["Administrador", "Tesouraria"] as const;

export type CashSessionState =
  | { available: false }
  | {
      available: true;
      /** Até este dia, numerário sem caixa aberto é aceite; depois é recusado. */
      enforceFrom: string | null;
      session: {
        id: string;
        openedAt: string;
        openedBy: string;
        openingFloat: number;
        expectedCash: number;
        openedByMe: boolean;
      } | null;
      pending: Array<{
        id: string;
        closedAt: string;
        closedBy: string;
        difference: number;
        reason: string | null;
        closedByMe: boolean;
      }>;
      canApprove: boolean;
      /** Depósitos no banco por confirmar no extracto (os da sessão aberta anulam-se). */
      deposits: Array<{
        id: string;
        amount: number;
        reference: string;
        depositedAt: string;
        depositedByMe: boolean;
        inOpenSession: boolean;
      }>;
    };

/** A migração ainda não está na base: o ecrã não mostra o bloco de caixa. */
function missingSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    /does not exist|schema cache/i.test(error.message ?? "")
  );
}

export const getCashSessionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CashSessionState> => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      ...TREASURY_ROLES,
    ]);
    const db = dynamicTablesClient(await loadSgaAdminClient());

    const point = await db
      .from("finance_cash_points")
      .select("id, enforce_from")
      .eq("school_id", membership.schoolId)
      .eq("active", true)
      .maybeSingle();
    if (missingSchema(point.error)) return { available: false };
    if (point.error) throw publicDatabaseError(point.error, "Não foi possível ler o caixa.");

    const [open, pending, deposits] = await Promise.all([
      db
        .from("finance_cash_sessions")
        .select("id, opened_at, opened_by, opening_float")
        .eq("school_id", membership.schoolId)
        .eq("status", "open")
        .maybeSingle(),
      db
        .from("finance_cash_sessions")
        .select("id, closed_at, closed_by, difference, difference_reason")
        .eq("school_id", membership.schoolId)
        .eq("status", "closed")
        .neq("difference", 0)
        .is("approved_by", null)
        .order("closed_at", { ascending: false })
        .limit(20),
      db
        .from("finance_cash_deposits")
        .select("id, amount, bank_reference, deposited_at, deposited_by, cash_session_id")
        .eq("school_id", membership.schoolId)
        .eq("status", "posted")
        .is("confirmed_at", null)
        .order("deposited_at", { ascending: false })
        .limit(50),
    ]);
    if (deposits.error) {
      throw publicDatabaseError(deposits.error, "Não foi possível ler os depósitos.");
    }
    if (open.error) throw publicDatabaseError(open.error, "Não foi possível ler o caixa.");
    if (pending.error) throw publicDatabaseError(pending.error, "Não foi possível ler o caixa.");

    let session = null;
    if (open.data) {
      const expected = await db.rpc("cash_session_expected", { session_id: open.data.id });
      if (expected.error) {
        throw publicDatabaseError(expected.error, "Não foi possível calcular o caixa.");
      }
      session = {
        id: String(open.data.id),
        openedAt: String(open.data.opened_at),
        openedBy: String(open.data.opened_by),
        openingFloat: Number(open.data.opening_float ?? 0),
        expectedCash: Number(expected.data ?? 0),
        openedByMe: open.data.opened_by === context.userId,
      };
    }

    return {
      available: true,
      // Sem posto, a escola ainda não registou numerário: os 30 dias começam no primeiro
      // uso (`private.cash_point_for`), por isso a data é a que a base gravaria hoje.
      enforceFrom: point.data?.enforce_from
        ? String(point.data.enforce_from)
        : addDaysIso(schoolTodayIso(), 30),
      session,
      pending: (pending.data ?? []).map((row) => ({
        id: String(row.id),
        closedAt: String(row.closed_at),
        closedBy: String(row.closed_by),
        difference: Number(row.difference ?? 0),
        reason: row.difference_reason ? String(row.difference_reason) : null,
        closedByMe: row.closed_by === context.userId,
      })),
      canApprove: membership.appRole === "Administrador",
      deposits: (deposits.data ?? []).map((row) => ({
        id: String(row.id),
        amount: Number(row.amount ?? 0),
        reference: String(row.bank_reference ?? ""),
        depositedAt: String(row.deposited_at),
        depositedByMe: row.deposited_by === context.userId,
        inOpenSession: Boolean(session && row.cash_session_id === session.id),
      })),
    };
  });

/** Fechos mostrados no relatório: os mais recentes, uma página. */
const CLOSED_SESSIONS_PAGE = 12;

/**
 * Relatório dos últimos fechos (§4.6): fundo, entradas, saídas, esperado, contado e a
 * diferença com o estado da aprovação. Os totais saem dos movimentos ligados a cada sessão.
 */
export const listCashSessionReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CashSessionReport[]> => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      ...TREASURY_ROLES,
    ]);
    const db = dynamicTablesClient(await loadSgaAdminClient());
    const schoolId = membership.schoolId;

    const closed = await db
      .from("finance_cash_sessions")
      .select(
        "id, opened_at, closed_at, opening_float, expected_cash, counted_cash, difference, difference_reason, approved_at",
      )
      .eq("school_id", schoolId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(CLOSED_SESSIONS_PAGE);
    if (missingSchema(closed.error)) return [];
    if (closed.error) throw publicDatabaseError(closed.error, "Não foi possível ler os fechos.");
    const sessions = (closed.data ?? []) as ClosedSessionRow[];
    if (!sessions.length) return [];
    const ids = sessions.map((row) => row.id);

    const movements = (table: string, column: string) =>
      db
        .from(table)
        .select(`amount, ${column}`)
        .eq("school_id", schoolId)
        .in(column, ids)
        .then(({ data, error }) => {
          if (error) throw publicDatabaseError(error, "Não foi possível ler os fechos.");
          return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
            (row): SessionMovement => ({
              session_id: String(row[column]),
              amount: row["amount"] as number | string | null,
            }),
          );
        });
    const [receipts, reversedReceipts, expenses, reversedExpenses, deposits] = await Promise.all([
      movements("finance_receipts", "cash_session_id"),
      movements("finance_receipts", "reversed_in_session_id"),
      movements("siga_cash_expenses", "cash_session_id"),
      movements("siga_cash_expenses", "reversed_in_session_id"),
      db
        .from("finance_cash_deposits")
        .select("amount, cash_session_id")
        .eq("school_id", schoolId)
        .eq("status", "posted")
        .in("cash_session_id", ids)
        .then(({ data, error }) => {
          if (error) throw publicDatabaseError(error, "Não foi possível ler os fechos.");
          return ((data ?? []) as Array<Record<string, unknown>>).map((row): SessionMovement => ({
            session_id: String(row["cash_session_id"]),
            amount: row["amount"] as number | string | null,
          }));
        }),
    ]);
    return summarizeCashSessions(sessions, {
      receipts,
      reversedReceipts,
      expenses,
      reversedExpenses,
    });
  });

const openInput = z.object({ openingFloat: z.number().min(0).max(999_999_999_999.99) });

export const openCashSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => openInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Abrir o caixa");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      [...TREASURY_ROLES],
    );
    const { data: outcome, error } = await dynamicTablesClient(context.supabase).rpc(
      "open_cash_session",
      {
        school_id: membership.schoolId,
        opening_float: data.openingFloat,
      },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível abrir o caixa.");
    return outcome as { sessionId: string };
  });

const closeInput = z.object({
  sessionId: z.string().uuid(),
  countedCash: z.number().min(0).max(999_999_999_999.99),
  reason: z.string().trim().max(500).optional(),
});

export const closeCashSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => closeInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Fechar o caixa");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      [...TREASURY_ROLES],
    );
    const { data: outcome, error } = await dynamicTablesClient(context.supabase).rpc(
      "close_cash_session",
      {
        school_id: membership.schoolId,
        session_id: data.sessionId,
        counted_cash: data.countedCash,
        reason: data.reason || null,
      },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível fechar o caixa.");
    return outcome as { sessionId: string; expectedCash: number; difference: number };
  });

const approveInput = z.object({ sessionId: z.string().uuid() });

export const approveCashDifference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => approveInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Aprovar a diferença de caixa");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador"],
    );
    const { data: outcome, error } = await dynamicTablesClient(context.supabase).rpc(
      "approve_cash_difference",
      {
        school_id: membership.schoolId,
        session_id: data.sessionId,
      },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível aprovar a diferença.");
    return outcome as { sessionId: string };
  });

const depositInput = z.object({
  amount: z.number().positive().max(999_999_999_999.99),
  bankReference: z.string().trim().min(3).max(80),
});

/** Numerário da gaveta depositado no banco, com o nº do talão. Sai da sessão aberta. */
export const recordCashDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => depositInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Depositar no banco");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      [...TREASURY_ROLES],
    );
    const { data: outcome, error } = await dynamicTablesClient(context.supabase).rpc(
      "record_cash_deposit",
      {
        school_id: membership.schoolId,
        amount: data.amount,
        bank_reference: data.bankReference,
      },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível registar o depósito.");
    return outcome as { depositId: string; sessionId: string };
  });

const reverseDepositInput = z.object({
  depositId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

/** Anular um depósito registado por engano, com o caixa ainda aberto. */
export const reverseCashDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reverseDepositInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Anular o depósito");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      [...TREASURY_ROLES],
    );
    const { data: outcome, error } = await dynamicTablesClient(context.supabase).rpc(
      "reverse_cash_deposit",
      { school_id: membership.schoolId, deposit_id: data.depositId, reason: data.reason },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível anular o depósito.");
    return outcome as { depositId: string };
  });

const confirmDepositInput = z.object({ depositId: z.string().uuid() });

/** Confirmar no extracto do banco. Quem registou o depósito não o confirma. */
export const confirmCashDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => confirmDepositInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Confirmar o depósito");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      [...TREASURY_ROLES],
    );
    const { data: outcome, error } = await dynamicTablesClient(context.supabase).rpc(
      "confirm_cash_deposit",
      { school_id: membership.schoolId, deposit_id: data.depositId },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível confirmar o depósito.");
    return outcome as { depositId: string };
  });
