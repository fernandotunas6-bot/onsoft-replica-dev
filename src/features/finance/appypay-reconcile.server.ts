import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppyPayCharge } from "@/lib/appypay.server";
import { settleGatewayPayment } from "@/features/finance/gateway-webhook-handler";

type ChargeRow = {
  id: string;
  school_id: string;
  invoice_id: string;
  method: string;
  merchant_transaction_id: string;
  provider_charge_id: string | null;
  amount: number;
  status: string;
  reference_number: string | null;
};

/**
 * Concilia uma cobrança AppyPay: confirma o estado junto da AppyPay (nunca confia
 * só no aviso recebido), e se foi paga liquida a factura e emite o recibo uma única vez.
 */
export async function reconcileAppyPayCharge(
  db: SupabaseClient,
  row: ChargeRow,
  payload?: Record<string, unknown>,
) {
  if (row.status === "paid") return { status: "paid", alreadyReconciled: true };
  if (!row.provider_charge_id) return { status: row.status };
  const remote = await getAppyPayCharge(row.provider_charge_id);
  if (!remote) return { status: row.status };

  if (
    remote.merchantTransactionId &&
    remote.merchantTransactionId !== row.merchant_transaction_id
  ) {
    await db
      .from("payment_gateway_charges")
      .update({ status: "mismatch", status_message: "Identificador da transacção não confere." })
      .eq("id", row.id);
    return { status: "mismatch" };
  }

  const s = remote.status.toLowerCase();
  const now = new Date().toISOString();
  if (remote.successful && s === "success") {
    // Marca primeiro como "a liquidar" só se ainda estiver pendente: evita recibos em dobro
    // quando a AppyPay repete o aviso em simultâneo.
    const { data: claimed } = await db
      .from("payment_gateway_charges")
      .update({ status: "settling", last_webhook_at: now, raw_last_payload: payload ?? remote.raw })
      .eq("id", row.id)
      .in("status", ["pending", "failed", "expired"])
      .select("id");
    if (!claimed?.length) return { status: "settling" };

    const amount = Math.min(Number(row.amount), Number(remote.amount || row.amount));
    try {
      const settled = await settleGatewayPayment(db, {
        schoolId: row.school_id,
        invoiceId: row.invoice_id,
        amount,
        method: row.method === "GPO" ? "multicaixa_express" : "multicaixa",
        reference: row.reference_number ?? row.merchant_transaction_id,
        externalId: row.provider_charge_id,
      });
      await db
        .from("payment_gateway_charges")
        .update({
          status: "paid",
          status_message: remote.message,
          receipt_number: settled.receiptNumber,
          reconciled_at: now,
        })
        .eq("id", row.id);
      return { status: "paid", receiptNumber: settled.receiptNumber };
    } catch (e) {
      await db
        .from("payment_gateway_charges")
        .update({ status: "needs_review", status_message: (e as Error).message.slice(0, 300) })
        .eq("id", row.id);
      return { status: "needs_review" };
    }
  }

  const mapped = s.includes("expir")
    ? "expired"
    : s === "failed" || (remote.successful === false && s !== "pending")
      ? "failed"
      : "pending";
  await db
    .from("payment_gateway_charges")
    .update({
      status: mapped,
      status_message: remote.message,
      last_webhook_at: now,
      raw_last_payload: payload ?? remote.raw,
    })
    .eq("id", row.id)
    .neq("status", "paid");
  return { status: mapped };
}
