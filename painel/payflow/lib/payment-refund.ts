import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  bankTransferInstructions,
  paymentEvents,
  paymentReceipts,
  payments,
  studentInvoices,
} from "@/db/schema";
import { refundEligibility } from "@/lib/payment-refund-policy";

export { refundEligibility } from "@/lib/payment-refund-policy";

export type PaymentRefundResult =
  | {
      ok: true;
      paymentId: string;
      status: "refunded";
      receiptCode: string | null;
      invoiceId: string | null;
      idempotent: boolean;
    }
  | { ok: false; status: number; code: string; message: string };

export async function executePaymentRefund(input: {
  paymentId: string;
  requiredSchoolId: string;
  actorRole: string;
  actorUserId: string;
  reason: string;
}): Promise<PaymentRefundResult> {
  const db = getDb();
  const [record] = await db
    .select({
      paymentId: payments.id,
      paymentStatus: payments.status,
      schoolId: payments.schoolId,
      invoiceId: payments.invoiceId,
      instructionId: bankTransferInstructions.id,
      instructionStatus: bankTransferInstructions.status,
      receiptCode: paymentReceipts.receiptCode,
    })
    .from(payments)
    .leftJoin(bankTransferInstructions, eq(bankTransferInstructions.paymentId, payments.id))
    .leftJoin(paymentReceipts, eq(paymentReceipts.paymentId, payments.id))
    .where(eq(payments.id, input.paymentId))
    .limit(1);

  if (!record) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Pagamento não encontrado.",
    };
  }

  const gate = refundEligibility({
    paymentStatus: record.paymentStatus,
    paymentSchoolId: record.schoolId,
    requiredSchoolId: input.requiredSchoolId,
    actorRole: input.actorRole,
    reason: input.reason,
  });
  if (!gate.ok) return gate;

  if (record.paymentStatus === "refunded") {
    return {
      ok: true,
      paymentId: record.paymentId,
      status: "refunded",
      receiptCode: record.receiptCode,
      invoiceId: record.invoiceId,
      idempotent: true,
    };
  }

  const now = new Date().toISOString();
  const auditPayload = JSON.stringify({
    reason: input.reason.trim(),
    admin_user_id: input.actorUserId,
    admin_role: input.actorRole,
    school_id: record.schoolId,
    receipt_preserved: true,
  });

  const updatePayment = db
    .update(payments)
    .set({ status: "refunded", updatedAt: now })
    .where(and(eq(payments.id, record.paymentId), eq(payments.status, "paid")));
  const refundEvent = db.insert(paymentEvents).values({
    paymentId: record.paymentId,
    type: "payment.refunded",
    payload: auditPayload,
    createdAt: now,
  });
  const statements = [updatePayment, refundEvent];
  if (record.instructionId && record.instructionStatus === "verified") {
    statements.push(
      db
        .update(bankTransferInstructions)
        .set({ status: "reversed", updatedAt: now })
        .where(eq(bankTransferInstructions.id, record.instructionId)),
    );
  }
  if (record.invoiceId) {
    statements.push(
      db
        .update(studentInvoices)
        .set({ status: "open", updatedAt: now })
        .where(eq(studentInvoices.id, record.invoiceId)),
    );
  }
  await db.batch(statements as typeof statements & [typeof updatePayment, typeof refundEvent]);

  return {
    ok: true,
    paymentId: record.paymentId,
    status: "refunded",
    receiptCode: record.receiptCode,
    invoiceId: record.invoiceId,
    idempotent: false,
  };
}

