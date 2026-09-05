import { z } from "zod";

import { requireAdminPermission } from "@/lib/admin-session";
import { logPayflowEvent } from "@/lib/ops-log";
import { corsHeaders, jsonResponse } from "@/lib/payflow";
import { executePaymentRefund } from "@/lib/payment-refund";

export const dynamic = "force-dynamic";

const refundSchema = z.object({
  reason: z.string().trim().min(8).max(500),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminPermission(request, "payments:refund");
  if (!session || session.role !== "finance_admin") {
    return jsonResponse(
      {
        error: {
          code: "refund_requires_finance_admin",
          message: "O estorno exige o papel finance_admin (Administrador SIGA via SSO).",
        },
      },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  try {
    const parsed = refundSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: "refund_reason_required",
            message: "Descreva o motivo do estorno (mínimo 8 caracteres).",
            fields: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const result = await executePaymentRefund({
      paymentId: id,
      requiredSchoolId: session.schoolId,
      actorRole: session.role,
      actorUserId: session.userId,
      reason: parsed.data.reason,
    });
    if (!result.ok) {
      logPayflowEvent("payment.refund.rejected", {
        code: result.code,
        school_id: session.schoolId,
        payment_id: id,
      });
      return jsonResponse(
        { error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }

    logPayflowEvent("payment.refund.ok", {
      school_id: session.schoolId,
      payment_id: result.paymentId,
      idempotent: result.idempotent,
    });
    return jsonResponse({
      data: {
        payment_id: result.paymentId,
        status: result.status,
        receipt_code: result.receiptCode,
        invoice_id: result.invoiceId,
        idempotent: result.idempotent,
        receipt_preserved: true,
      },
    });
  } catch (error) {
    console.error("payment_refund_failed", error);
    return jsonResponse(
      { error: { code: "payment_refund_failed", message: "Não foi possível estornar o pagamento." } },
      { status: 500 },
    );
  }
}
