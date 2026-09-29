import { createServerFn } from "@tanstack/react-start";
import { reportSigaError } from "@/lib/ops-report";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GatewayCharge = {
  id: string;
  invoice_id: string;
  student_name: string | null;
  method: string;
  merchant_transaction_id: string;
  amount: number;
  reference_entity: string | null;
  reference_number: string | null;
  status: string;
  status_message: string | null;
  receipt_number: string | null;
  created_at: string;
};

async function treasury(userId: string, mode: "read" | "write" = "read") {
  const { requireSgaWriterFor, requireSgaWriterForWrite, loadSgaAdminClient } =
    await import("@/integrations/supabase/sga-admin");
  const m = await (mode === "write" ? requireSgaWriterForWrite : requireSgaWriterFor)(
    "financeiro",
    userId,
    ["Administrador", "Tesouraria"],
  );
  return { schoolId: m.schoolId, db: await loadSgaAdminClient() };
}

export const getAppyPayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await treasury(context.userId);
    const { appyPayConfigured } = await import("@/lib/appypay.server");
    return {
      configured: appyPayConfigured(),
      webhookReady: (process.env["APPYPAY_WEBHOOK_TOKEN"]?.trim().length ?? 0) >= 16,
      environment: process.env["APPYPAY_ENV"] === "production" ? "produção" : "testes",
    };
  });

export const listGatewayCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GatewayCharge[]> => {
    const { schoolId, db } = await treasury(context.userId);
    const { data, error } = await db
      .from("payment_gateway_charges")
      .select(
        "id, invoice_id, student_name, method, merchant_transaction_id, amount, reference_entity, reference_number, status, status_message, receipt_number, created_at",
      )
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Não foi possível carregar as cobranças.");
    return (data ?? []).map((r: GatewayCharge) => ({ ...r, amount: Number(r.amount) }));
  });

const createSchema = z.object({
  invoiceId: z.string().uuid(),
  studentName: z.string().max(200).optional().default(""),
  amount: z.number().positive().max(100_000_000),
  method: z.enum(["GPO", "REF"]),
  phoneNumber: z
    .string()
    .regex(/^9\d{8}$/, "Número de telefone angolano inválido (9 dígitos, começa por 9).")
    .optional(),
});

export const createInvoiceCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { schoolId, db } = await treasury(context.userId, "write");
    if (data.method === "GPO" && !data.phoneNumber) {
      throw new Error("Indique o número Multicaixa Express do encarregado.");
    }
    const { data: invoice } = await db
      .from("finance_invoices")
      .select("id, invoice_number, status, amount, discount_amount")
      .eq("id", data.invoiceId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!invoice) throw new Error("Factura não encontrada.");
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      throw new Error("Esta factura já não tem valor por pagar.");
    }
    // O que falta pagar: total, menos desconto, menos os recibos já emitidos.
    const { data: receipts } = await db
      .from("finance_receipts")
      .select("amount")
      .eq("school_id", schoolId)
      .eq("invoice_id", data.invoiceId)
      .eq("status", "issued");
    const alreadyPaid = (receipts ?? []).reduce(
      (sum: number, r: { amount: unknown }) => sum + Number(r.amount || 0),
      0,
    );
    const due = Number(invoice.amount) - Number(invoice.discount_amount ?? 0) - alreadyPaid;
    if (due <= 0.009) throw new Error("Esta factura já não tem valor por pagar.");
    if (data.amount > due + 0.01) {
      throw new Error(`O valor é maior do que o que falta pagar (${due.toFixed(2)} Kz).`);
    }

    const { appyPayConfigured, createAppyPayCharge, newMerchantTransactionId } =
      await import("@/lib/appypay.server");
    if (!appyPayConfigured()) {
      throw new Error(
        "A AppyPay ainda não está ligada. Peça ao administrador para guardar as chaves.",
      );
    }
    const mtx = newMerchantTransactionId();
    const { data: row, error } = await db
      .from("payment_gateway_charges")
      .insert({
        school_id: schoolId,
        invoice_id: data.invoiceId,
        student_name: data.studentName || null,
        method: data.method,
        merchant_transaction_id: mtx,
        amount: data.amount,
        phone_number: data.phoneNumber ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error("Não foi possível registar a cobrança.");

    try {
      const charge = await createAppyPayCharge({
        method: data.method,
        amount: data.amount,
        merchantTransactionId: mtx,
        description: `Factura ${invoice.invoice_number ?? ""}`,
        phoneNumber: data.phoneNumber,
      });
      const { error: linkError } = await db
        .from("payment_gateway_charges")
        .update({
          provider_charge_id: charge.id || null,
          reference_entity: charge.referenceEntity,
          reference_number: charge.referenceNumber,
          status_message: charge.message,
        })
        .eq("id", row.id);
      // A referência já existe na AppyPay e é válida: não se falha o pedido. O
      // webhook encontra a cobrança pelo merchantTransactionId e liga-a; até lá a
      // conciliação manual não a vê, por isso a falha fica nos registos.
      if (linkError) {
        reportSigaError("finance.appypay.charge_write_failed", linkError, {
          status: "created",
          charge_id: row.id,
          provider_charge_id: charge.id || null,
        });
      }
      return {
        id: row.id,
        referenceEntity: charge.referenceEntity,
        referenceNumber: charge.referenceNumber,
        message:
          data.method === "GPO"
            ? "Pedido enviado. O encarregado deve aprovar no telemóvel (Multicaixa Express)."
            : "Referência criada. O pagamento é confirmado automaticamente.",
      };
    } catch (e) {
      const { error: failError } = await db
        .from("payment_gateway_charges")
        .update({ status: "failed", status_message: (e as Error).message.slice(0, 300) })
        .eq("id", row.id);
      if (failError) {
        reportSigaError("finance.appypay.charge_write_failed", failError, {
          status: "failed",
          charge_id: row.id,
        });
      }
      throw e;
    }
  });

/** Conciliação manual: volta a consultar a AppyPay para todas as cobranças ainda em aberto. */
export const reconcileOpenCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { schoolId, db } = await treasury(context.userId, "write");
    const { data: rows } = await db
      .from("payment_gateway_charges")
      .select("*")
      .eq("school_id", schoolId)
      .in("status", ["pending", "needs_review"])
      .not("provider_charge_id", "is", null)
      .limit(50);
    const { reconcileAppyPayCharge } = await import("@/features/finance/appypay-reconcile.server");
    let paid = 0;
    let checked = 0;
    for (const r of rows ?? []) {
      checked += 1;
      const res = await reconcileAppyPayCharge(db, {
        ...r,
        status: r.status === "needs_review" ? "pending" : r.status,
      }).catch(() => null);
      if (res?.status === "paid") paid += 1;
    }
    return { checked, paid };
  });
