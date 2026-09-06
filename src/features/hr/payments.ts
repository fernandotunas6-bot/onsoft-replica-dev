import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

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
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /hr_(payment|payroll_payment)|schema cache|does not exist/i.test(error.message ?? "")));
}

function maskLast4(value: string | null | undefined, label: string) {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "");
  return `${label} ••••${normalized.slice(-4)}`;
}

const destinationSchema = z.object({
  employmentId: z.string().uuid(),
  method: z.enum(["transfer", "cash", "other"]),
  beneficiaryName: z.string().trim().min(2).max(160),
  bankName: z.string().trim().max(160).optional().default(""),
  iban: z.string().trim().max(64).optional().default(""),
  accountNumber: z.string().trim().max(80).optional().default(""),
  destinationReference: z.string().trim().max(160).optional().default(""),
}).superRefine((value, ctx) => {
  if (value.method === "transfer" && !value.iban && !value.accountNumber && !value.destinationReference) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["iban"], message: "Indique IBAN, número de conta ou referência segura." });
  }
});

export const upsertHrPaymentDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => destinationSchema.parse(input))
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
    if (employmentError) throw publicDatabaseError(employmentError, "Não foi possível validar o vínculo.");
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
    if (existingError && !missingPaymentSchema(existingError)) {
      throw publicDatabaseError(existingError, "Não foi possível carregar o destino de pagamento.");
    }

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
      const { error } = await db.from("hr_payment_destinations").update(payload).eq("id", existing.id).eq("school_id", membership.schoolId);
      if (error) throw publicDatabaseError(error, "Não foi possível actualizar o destino de pagamento.");
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
      .select("id, employment_id, method, beneficiary_name, bank_name, iban, account_number, destination_reference, active")
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
      destinationLabel: maskLast4(row.iban ? String(row.iban) : row.account_number ? String(row.account_number) : null, row.iban ? "IBAN" : "Conta") ?? (row.destination_reference ? String(row.destination_reference) : row.method === "cash" ? "Numerário" : "Outro"),
    }));
  });

export const createPayrollPaymentBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ payrollRunId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePaymentAdmin(context.userId);
    const { data: result, error } = await context.supabase.rpc("hr_create_payroll_payment_batch", { p_payroll_run_id: data.payrollRunId });
    if (error) throw publicDatabaseError(error, "Não foi possível preparar a ordem de pagamento.");
    return result;
  });

export const refreshPayrollPaymentBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePaymentAdmin(context.userId);
    const { data: result, error } = await context.supabase.rpc("hr_refresh_payroll_payment_batch", { p_batch_id: data.batchId });
    if (error) throw publicDatabaseError(error, "Não foi possível sincronizar os beneficiários da ordem.");
    return result;
  });

export const authorizePayrollPaymentBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePaymentAdmin(context.userId);
    const { data: result, error } = await context.supabase.rpc("hr_authorize_payroll_payment_batch", { p_batch_id: data.batchId });
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
      .select("id, payroll_run_id, batch_number, method, status, total_amount_kz, payable_count, blocked_count, prepared_at, prepared_by, authorized_at, authorized_by")
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
  .validator((input: unknown) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requirePaymentAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { data: batch, error: batchError } = await db
      .from("hr_payroll_payment_batches")
      .select("id, payroll_run_id, batch_number, method, status, total_amount_kz, payable_count, blocked_count, prepared_at, prepared_by, authorized_at, authorized_by")
      .eq("id", data.batchId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (batchError) throw publicDatabaseError(batchError, "Não foi possível carregar a ordem salarial.");
    if (!batch) return null;

    const { data: items, error: itemsError } = await db
      .from("hr_payroll_payment_items")
      .select("id, payroll_item_id, employment_id, beneficiary_name, destination_label, amount_kz, status, block_reason, provider_reference, failure_reason, paid_at")
      .eq("batch_id", data.batchId)
      .eq("school_id", membership.schoolId)
      .order("beneficiary_name", { ascending: true });
    if (itemsError) throw publicDatabaseError(itemsError, "Não foi possível carregar os beneficiários da ordem salarial.");
    return { batch, items: items ?? [] };
  });
