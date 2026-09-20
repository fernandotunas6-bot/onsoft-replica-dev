import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { paymentReceipts, payments } from "@/db/schema";
import { getBankTransferDetails, publicBankTransfer } from "@/lib/bank-transfers";
import { corsHeaders, jsonResponse } from "@/lib/payflow";
import { isSandboxRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    const [payment] = await getDb()
      .select({
        id: payments.id,
        amount: payments.amountMinor,
        currency: payments.currency,
        description: payments.description,
        customerName: payments.customerName,
        sourceApp: payments.sourceApp,
        status: payments.status,
        paymentMethod: payments.paymentMethod,
        provider: payments.provider,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.checkoutToken, token))
      .limit(1);

    if (!payment) {
      return jsonResponse(
        { error: { code: "not_found", message: "Link de pagamento inválido ou expirado." } },
        { status: 404 },
      );
    }

    const [receipt] = await getDb()
      .select({ code: paymentReceipts.receiptCode, issuedAt: paymentReceipts.issuedAt })
      .from(paymentReceipts)
      .where(eq(paymentReceipts.paymentId, payment.id))
      .limit(1);
    const transfer = await getBankTransferDetails(payment.id);

    return jsonResponse({
      data: {
        ...payment,
        canConfirm: isSandboxRuntime() && payment.provider === "emis_sandbox",
        bankTransfer: transfer ? publicBankTransfer(transfer) : null,
        receipt: receipt
          ? {
              code: receipt.code,
              issuedAt: receipt.issuedAt,
              verificationUrl: new URL(`/comprovativo/${receipt.code}`, _request.url).toString(),
            }
          : null,
      },
    });
  } catch {
    return jsonResponse(
      { error: { code: "internal_error", message: "Não foi possível abrir este pagamento." } },
      { status: 500 },
    );
  }
}
