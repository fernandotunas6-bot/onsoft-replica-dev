import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import {
  canConfirmPaymentItem,
  confirmPayrollPaymentItemInputSchema,
  HR_PAYMENT_CONFIRMABLE_STATUSES,
  maskPaymentDestinationLabel,
  paymentBatchIdInputSchema,
  payrollRunIdInputSchema,
  upsertHrPaymentDestinationInputSchema,
} from "@/features/hr/schemas";

const PAYMENT_ROLES = new Set(["Administrador", "Tesouraria"]);

async function requirePaymentAdmin(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!PAYMENT_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para gerir ordens de pagamento salarial.");
  }
  return membership;
}

function missingPaymentSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /hr_(payment|payroll_payment)|schema cache|does not exist/i.test(error.message ?? "")),
  );
}

export const upsertHrPaymentDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertHrPaymentDestinationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requirePaymentAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { data: employment, error: employmentError } = await db
      .from("hr_employments")
      .select("id")
      .eq("id", data.employmentId)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .maybeSingle();
    if (employmentError)
      throw publicDatabaseError(employmentError, "Não foi possível validar o vínculo.");
    if (!employment) throw new Error("Vínculo funcional não encontrado.");

    const { data: existing, error: existingError } = await db
      .from("hr_payment_destinations")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("employment_id", data.employmentId)
      .eq("is_primary", true)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingError && !missingPaymentSchema(existingError))
      throw publicDatabaseError(existingError, "Não foi possível carregar o destino de pagamento.");

    const payload = {
      school_id: membership.schoolId,
      employment_id: data.employmentId,
      method: data.method,
      beneficiary_name: data.beneficiaryName,
      bank_name: data.bankName || null,
      iban: data.iban || null,
      account_number: data.accountNumber || null,
      destination_reference: data.destinationReference || null,
      is_primary: true,
      active: true,
      updated_by: context.userId,
    };

    if (existing?.id) {
      const { error } = await db
        .from("hr_payment_destinations")
        .update(payload)
        .eq("id", existing.id)
        .eq("school_id", membership.schoolId);
      if (error)
        throw publicDatabaseError(error, "Não foi possível actualizar o destino de pagamento.");
      return { saved: true, id: String(existing.id) };
    }

    const { data: created, error } = await db
      .from("hr_payment_destinations")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível guardar o destino de pagamento.");
    return { saved: true, id: String(created.id) };
  });

export const listHrPaymentDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requirePaymentAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_payment_destinations")
      .select(
        "id, employment_id, method, beneficiary_name, bank_name, iban, account_number, destination_reference, active",
      )
      .eq("school_id", membership.schoolId)
      .eq("active", true)
      .is("deleted_at", null);
    if (error) {
      if (missingPaymentSchema(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar os destinos de pagamento.");
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      employmentId: String(row.employment_id),
      method: String(row.method),
      beneficiaryName: String(row.beneficiary_name),
      bankName: row.bank_name ? String(row.bank_name) : null,
      destinationLabel: maskPaymentDestinationLabel(
        row.iban ? String(row.iban) : null,
        row.account_number ? String(row.account_number) : null,
        row.destination_reference ? String(row.destination_reference) : null,
        String(row.method),
      ),
    }));
  });

export const createPayrollPaymentBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => payrollRunIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePaymentAdmin(context.userId);
    const { data: result, error } = await context.supabase.rpc("hr_create_payroll_payment_batch", {
      p_payroll_run_id: data.payrollRunId,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível preparar a ordem de pagamento.");
    return result;
  });

export const refreshPayrollPaymentBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => paymentBatchIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePaymentAdmin(context.userId);
    const { data: result, error } = await context.supabase.rpc("hr_refresh_payroll_payment_batch", {
      p_batch_id: data.batchId,
    });
    if (error)
      throw publicDatabaseError(error, "Não foi possível sincronizar os beneficiários da ordem.");
    return result;
  });

export const authorizePayrollPaymentBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => paymentBatchIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePaymentAdmin(context.userId);
    const { data: result, error } = await context.supabase.rpc(
      "hr_authorize_payroll_payment_batch",
      { p_batch_id: data.batchId },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível autorizar a ordem de pagamento.");
    return result;
  });

export const listPayrollPaymentBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requirePaymentAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_payroll_payment_batches")
      .select(
        "id, payroll_run_id, batch_number, method, status, total_amount_kz, payable_count, blocked_count, prepared_at, prepared_by, authorized_at, authorized_by",
      )
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(36);
    if (error) {
      if (missingPaymentSchema(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as ordens salariais.");
    }
    return data ?? [];
  });

export const getPayrollPaymentBatchDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => paymentBatchIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requirePaymentAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { data: batch, error: batchError } = await db
      .from("hr_payroll_payment_batches")
      .select(
        "id, payroll_run_id, batch_number, method, status, total_amount_kz, payable_count, blocked_count, prepared_at, prepared_by, authorized_at, authorized_by",
      )
      .eq("id", data.batchId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (batchError)
      throw publicDatabaseError(batchError, "Não foi possível carregar a ordem salarial.");
    if (!batch) return null;

    const { data: items, error: itemsError } = await db
      .from("hr_payroll_payment_items")
      .select(
        "id, payroll_item_id, employment_id, beneficiary_name, destination_label, amount_kz, status, block_reason, provider_reference, failure_reason, paid_at, cash_expense_id",
      )
      .eq("batch_id", data.batchId)
      .eq("school_id", membership.schoolId)
      .order("beneficiary_name", { ascending: true });
    if (itemsError)
      throw publicDatabaseError(
        itemsError,
        "Não foi possível carregar os beneficiários da ordem salarial.",
      );
    return { batch, items: items ?? [] };
  });

export const confirmPayrollPaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => confirmPayrollPaymentItemInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requirePaymentAdmin(context.userId);
    const db = await loadSgaAdminClient();

    const { data: item, error: itemError } = await db
      .from("hr_payroll_payment_items")
      .select("id, batch_id, payroll_item_id, beneficiary_name, amount_kz, status, cash_expense_id")
      .eq("id", data.paymentItemId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (itemError)
      throw publicDatabaseError(itemError, "Não foi possível carregar o pagamento salarial.");
    if (!item) throw new Error("Item de pagamento não encontrado.");
    if (String(item.status) === "paid")
      return {
        paid: true,
        idempotent: true,
        cashExpenseId: item.cash_expense_id ? String(item.cash_expense_id) : null,
      };

    const { data: batch, error: batchError } = await db
      .from("hr_payroll_payment_batches")
      .select("id, payroll_run_id, batch_number, method, status")
      .eq("id", item.batch_id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (batchError)
      throw publicDatabaseError(batchError, "Não foi possível carregar a ordem salarial.");
    if (!batch || !["authorized", "processing", "partial"].includes(String(batch.status)))
      throw new Error("A ordem salarial precisa estar autorizada antes da execução.");

    if (!canConfirmPaymentItem(String(item.status))) {
      throw new Error("Este item não está pronto para confirmação de pagamento.");
    }

    if (data.result === "failed") {
      const { data: failedRow, error } = await db
        .from("hr_payroll_payment_items")
        .update({
          status: "failed",
          provider_reference: data.reference,
          failure_reason: data.failureReason,
          updated_by: context.userId,
        })
        .eq("id", item.id)
        .eq("school_id", membership.schoolId)
        .in("status", [...HR_PAYMENT_CONFIRMABLE_STATUSES])
        .select("id")
        .maybeSingle();
      if (error)
        throw publicDatabaseError(error, "Não foi possível registrar a falha do pagamento.");
      if (!failedRow)
        throw new Error("O estado do pagamento mudou; actualize a lista e tente de novo.");
      await db
        .from("hr_payroll_payment_batches")
        .update({ status: "partial", updated_by: context.userId })
        .eq("id", batch.id)
        .eq("school_id", membership.schoolId);
      return { paid: false, failed: true };
    }

    const documentNumber = `${String(batch.batch_number)}-${String(item.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    let cashExpenseId: string | null = item.cash_expense_id ? String(item.cash_expense_id) : null;

    if (!cashExpenseId) {
      const { data: existingExpense } = await db
        .from("siga_cash_expenses")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("document_number", documentNumber)
        .maybeSingle();
      if (existingExpense?.id) {
        cashExpenseId = String(existingExpense.id);
      } else {
        const { data: expense, error: expenseError } = await db
          .from("siga_cash_expenses")
          .insert({
            school_id: membership.schoolId,
            document_number: documentNumber,
            description: `Pagamento salarial ${String(item.beneficiary_name)} · ${String(batch.batch_number)}`,
            category: "Salários",
            amount: Number(item.amount_kz ?? 0),
            method: String(batch.method) === "cash" ? "cash" : "transfer",
            reference: data.reference,
            occurred_at: new Date().toISOString(),
            status: "posted",
            created_by: context.userId,
            updated_by: context.userId,
          })
          .select("id")
          .single();
        if (expenseError)
          throw publicDatabaseError(
            expenseError,
            "Não foi possível lançar a saída salarial no caixa.",
          );
        cashExpenseId = String(expense.id);
      }
    }

    const now = new Date().toISOString();
    const { data: paidRow, error: payError } = await db
      .from("hr_payroll_payment_items")
      .update({
        status: "paid",
        provider_reference: data.reference,
        failure_reason: null,
        paid_at: now,
        confirmed_by: context.userId,
        cash_expense_id: cashExpenseId,
        updated_by: context.userId,
      })
      .eq("id", item.id)
      .eq("school_id", membership.schoolId)
      .in("status", [...HR_PAYMENT_CONFIRMABLE_STATUSES])
      .select("id")
      .maybeSingle();
    if (payError)
      throw publicDatabaseError(payError, "Não foi possível confirmar o pagamento salarial.");
    if (!paidRow)
      throw new Error("O estado do pagamento mudou; actualize a lista e tente de novo.");

    await db
      .from("hr_payroll_items")
      .update({ status: "paid", updated_by: context.userId })
      .eq("id", item.payroll_item_id)
      .eq("school_id", membership.schoolId);

    const { data: remaining, error: remainingError } = await db
      .from("hr_payroll_payment_items")
      .select("id, status")
      .eq("batch_id", batch.id)
      .eq("school_id", membership.schoolId)
      .neq("status", "cancelled");
    if (remainingError)
      throw publicDatabaseError(
        remainingError,
        "Não foi possível recomputar o estado da ordem salarial.",
      );
    const allPaid =
      (remaining ?? []).length > 0 &&
      (remaining ?? []).every((row) => String(row.status) === "paid");
    const anyPaid = (remaining ?? []).some((row) => String(row.status) === "paid");

    await db
      .from("hr_payroll_payment_batches")
      .update({
        status: allPaid ? "completed" : anyPaid ? "partial" : "processing",
        updated_by: context.userId,
      })
      .eq("id", batch.id)
      .eq("school_id", membership.schoolId);
    if (allPaid) {
      await db
        .from("hr_payroll_runs")
        .update({ status: "paid", paid_at: now, updated_by: context.userId })
        .eq("id", batch.payroll_run_id)
        .eq("school_id", membership.schoolId);
    }

    return { paid: true, cashExpenseId, batchCompleted: allPaid };
  });
