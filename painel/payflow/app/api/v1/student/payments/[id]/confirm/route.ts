import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  emisTransactions,
  paymentEvents,
  paymentReceipts,
  payments,
  studentInvoices,
} from "@/db/schema";
import { createOpaqueId, createReceiptCode } from "@/lib/identifiers";
import { corsHeaders, jsonResponse } from "@/lib/payflow";
import { isSandboxRuntime } from "@/lib/runtime";
import { resolveStudentSession } from "@/lib/student-session";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSandboxRuntime()) {
    return jsonResponse(
      { error: { code: "confirmation_not_available", message: "A confirmação é feita exclusivamente pelo provedor." } },
      { status: 404 },
    );
  }

  try {
    const session = await resolveStudentSession(request);
    if (!session) {
      return jsonResponse(
        { error: { code: "student_session_expired", message: "A sessão expirou. Identifique-se novamente." } },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const db = getDb();
    const [payment] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, id),
          eq(payments.schoolId, session.schoolId),
          eq(payments.studentId, session.studentId),
        ),
      )
      .limit(1);

    if (!payment || !payment.invoiceId || payment.provider !== "emis_sandbox") {
      return jsonResponse(
        { error: { code: "payment_not_found", message: "Pagamento de teste não encontrado para este aluno." } },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    if (payment.status !== "paid") {
      await db
        .update(payments)
        .set({ status: "paid", updatedAt: now })
        .where(eq(payments.id, payment.id));

      await db
        .update(emisTransactions)
        .set({ status: "successful", responseCode: "SANDBOX_APPROVED", updatedAt: now })
        .where(eq(emisTransactions.paymentId, payment.id));

      await db
        .update(studentInvoices)
        .set({ status: "paid", updatedAt: now })
        .where(eq(studentInvoices.id, payment.invoiceId));

      await db.insert(paymentEvents).values({
        paymentId: payment.id,
        type: "payment.paid",
        payload: JSON.stringify({ provider: "emis_sandbox", sandbox: true }),
        createdAt: now,
      });
    }

    let [receipt] = await db
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.paymentId, payment.id))
      .limit(1);

    if (!receipt) {
      await db.insert(paymentReceipts).values({
        id: createOpaqueId("rcp", 20),
        receiptCode: createReceiptCode(),
        paymentId: payment.id,
        schoolId: session.schoolId,
        studentId: session.studentId,
        invoiceId: payment.invoiceId,
        issuedAt: now,
      });
      [receipt] = await db
        .select()
        .from(paymentReceipts)
        .where(eq(paymentReceipts.paymentId, payment.id))
        .limit(1);
    }

    const [emis] = await db
      .select()
      .from(emisTransactions)
      .where(eq(emisTransactions.paymentId, payment.id))
      .limit(1);

    return jsonResponse({
      data: {
        receipt_id: receipt.id,
        receipt_code: receipt.receiptCode,
        payment_id: payment.id,
        invoice_id: payment.invoiceId,
        invoice_code: payment.externalReference,
        school_id: session.schoolId,
        student_id: session.studentId,
        amount: payment.amountMinor,
        currency: payment.currency,
        status: "paid",
        provider: payment.provider,
        provider_transaction_id: emis?.providerTransactionId ?? payment.providerTransactionId,
        merchant_reference: emis?.merchantReference ?? payment.merchantReference,
        paid_at: receipt.issuedAt,
        verification_url: new URL(`/comprovativo/${receipt.receiptCode}`, request.url).toString(),
      },
    });
  } catch (error) {
    console.error("student_payment_confirmation_failed", error);
    return jsonResponse(
      { error: { code: "confirmation_failed", message: "Não foi possível confirmar o pagamento." } },
      { status: 500 },
    );
  }
}
