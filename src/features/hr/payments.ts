import { isMissingHrTable } from "@/features/hr/missing-table";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertModuleNotBlocked,
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { requireAal2 } from "@/features/hr/require-aal2";
import {
  confirmPayrollPaymentItemInputSchema,
  maskPaymentDestinationLabel,
  paymentBatchIdInputSchema,
  payrollRunIdInputSchema,
  upsertHrPaymentDestinationInputSchema,
} from "@/features/hr/schemas";

const PAYMENT_ROLES = new Set(["Administrador", "Tesouraria"]);

async function requirePaymentAdmin(userId: string, mode: "read" | "write" = "read") {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!PAYMENT_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para gerir ordens de pagamento salarial.");
  }
  // Permissões por módulo (Nenhum/Leitura) também valem no RH.
  await assertModuleNotBlocked(membership.schoolId, userId, "financeiro", mode);
  return membership;
}

export const upsertHrPaymentDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertHrPaymentDestinationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requirePaymentAdmin(context.userId, "write");
    requireAal2(context.claims, "Alterar o destino de pagamento de um salário");
    const { data: result, error } = await context.supabase.rpc("hr_upsert_payment_destination", {
      p_school_id: membership.schoolId,
      p_employment_id: data.employmentId,
      p_destination: {
        method: data.method,
        beneficiaryName: data.beneficiaryName,
        bankName: data.bankName,
        iban: data.iban,
        accountNumber: data.accountNumber,
        destinationReference: data.destinationReference,
      },
    });
    if (error)
      throw publicDatabaseError(
        error,
        "Não foi possível guardar o destino salarial e a auditoria.",
      );
    return result as { saved: boolean; id: string; unchanged?: boolean };
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
      if (isMissingHrTable(error)) return [];
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
    await requirePaymentAdmin(context.userId, "write");
    requireAal2(context.claims, "Preparar uma ordem de pagamento salarial");
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
    await requirePaymentAdmin(context.userId, "write");
    requireAal2(context.claims, "Sincronizar uma ordem de pagamento salarial");
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
    await requirePaymentAdmin(context.userId, "write");
    requireAal2(context.claims, "Autorizar uma ordem de pagamento salarial");
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
      if (isMissingHrTable(error)) return [];
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
    const membership = await requirePaymentAdmin(context.userId, "write");
    requireAal2(context.claims, "Confirmar um pagamento salarial");
    const { data: result, error } = await context.supabase.rpc("hr_confirm_payroll_payment_item", {
      p_school_id: membership.schoolId,
      p_payment_item_id: data.paymentItemId,
      p_result: data.result,
      p_reference: data.reference,
      p_failure_reason: data.failureReason || undefined,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível confirmar o pagamento salarial.");
    return result as {
      paid: boolean;
      failed?: boolean;
      idempotent?: boolean;
      cashExpenseId?: string | null;
      batchCompleted?: boolean;
    };
  });
