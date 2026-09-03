import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  bankTransferInstructions,
  bankTransferProofs,
  paymentEvents,
  paymentReceipts,
  payments,
  studentInvoices,
} from "@/db/schema";
import { createOpaqueId, createReceiptCode } from "@/lib/identifiers";
import { corsHeaders, isIntegrationAuthorized, jsonResponse } from "@/lib/payflow";

export const dynamic = "force-dynamic";

const verificationSchema = z.object({
  transfer_reference: z.string().trim().min(12).max(80).transform((value) => value.toUpperCase()),
  amount: z.number().int().positive().max(999_999_999_99),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  bank_transaction_id: z.string().trim().min(3).max(160),
  booked_at: z.string().datetime({ offset: true }),
  source: z.enum(["bank_api", "bank_statement", "manual_review"]),
  verified_by: z.string().trim().min(2).max(160),
});

type VerifiedRecord = {
  paymentId: string;
  receiptCode: string;
  issuedAt: string;
  amountMinor: number;
  currency: string;
  bankTransactionId: string | null;
};

function verifiedResponse(record: VerifiedRecord, requestUrl: string, idempotent: boolean) {
  return jsonResponse({
    data: {
      payment_id: record.paymentId,
      status: "paid",
      amount: record.amountMinor,
      currency: record.currency,
      bank_transaction_id: record.bankTransactionId,
      receipt_code: record.receiptCode,
      receipt_issued_at: record.issuedAt,
      verification_url: new URL(`/comprovativo/${record.receiptCode}`, requestUrl).toString(),
      idempotent,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  if (!isIntegrationAuthorized(request)) {
    return jsonResponse(
      { error: { code: "unauthorized", message: "Chave de integração inválida." } },
      { status: 401 },
    );
  }

  try {
    const parsed = verificationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: "invalid_verification",
            message: "Confira os dados do movimento bancário.",
            fields: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const db = getDb();
    const [record] = await db
      .select({
        instructionId: bankTransferInstructions.id,
        instructionStatus: bankTransferInstructions.status,
        expectedAmountMinor: bankTransferInstructions.expectedAmountMinor,
        expectedCurrency: bankTransferInstructions.currency,
        existingBankTransactionId: bankTransferInstructions.bankTransactionId,
        paymentId: payments.id,
        paymentStatus: payments.status,
        provider: payments.provider,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        schoolId: payments.schoolId,
        studentId: payments.studentId,
        invoiceId: payments.invoiceId,
        receiptCode: paymentReceipts.receiptCode,
        receiptIssuedAt: paymentReceipts.issuedAt,
      })
      .from(bankTransferInstructions)
      .innerJoin(payments, eq(payments.id, bankTransferInstructions.paymentId))
      .leftJoin(paymentReceipts, eq(paymentReceipts.paymentId, payments.id))
      .where(eq(bankTransferInstructions.transferReference, parsed.data.transfer_reference))
      .limit(1);

    if (!record || record.provider !== "bank_transfer") {
      return jsonResponse(
        { error: { code: "transfer_not_found", message: "Referência de transferência não encontrada." } },
        { status: 404 },
      );
    }

    if (
      record.expectedAmountMinor !== parsed.data.amount ||
      record.amountMinor !== parsed.data.amount ||
      record.expectedCurrency !== parsed.data.currency ||
      record.currency !== parsed.data.currency
    ) {
      return jsonResponse(
        {
          error: {
            code: "transfer_mismatch",
            message: "O valor ou a moeda do movimento não corresponde à instrução de pagamento.",
          },
        },
        { status: 409 },
      );
    }

    if (record.instructionStatus === "verified" || record.paymentStatus === "paid") {
      if (
        record.instructionStatus === "verified" &&
        record.paymentStatus === "paid" &&
        record.existingBankTransactionId === parsed.data.bank_transaction_id &&
        record.receiptCode &&
        record.receiptIssuedAt
      ) {
        return verifiedResponse(
          {
            paymentId: record.paymentId,
            receiptCode: record.receiptCode,
            issuedAt: record.receiptIssuedAt,
            amountMinor: record.amountMinor,
            currency: record.currency,
            bankTransactionId: record.existingBankTransactionId,
          },
          request.url,
          true,
        );
      }
      return jsonResponse(
        {
          error: {
            code: "transfer_already_processed",
            message: "Esta transferência já foi processada com outros dados.",
          },
        },
        { status: 409 },
      );
    }

    if (record.paymentStatus !== "pending") {
      return jsonResponse(
        { error: { code: "payment_not_pending", message: "O pagamento já não está pendente." } },
        { status: 409 },
      );
    }

    const [transactionConflict] = await db
      .select({ id: bankTransferInstructions.id })
      .from(bankTransferInstructions)
      .where(
        and(
          eq(bankTransferInstructions.bankTransactionId, parsed.data.bank_transaction_id),
          ne(bankTransferInstructions.id, record.instructionId),
        ),
      )
      .limit(1);
    if (transactionConflict) {
      return jsonResponse(
        {
          error: {
            code: "bank_transaction_already_used",
            message: "Este movimento bancário já confirmou outro pagamento.",
          },
        },
        { status: 409 },
      );
    }

    const proofs = await db
      .select({ id: bankTransferProofs.id })
      .from(bankTransferProofs)
      .where(eq(bankTransferProofs.instructionId, record.instructionId))
      .limit(3);
    if (parsed.data.source === "manual_review" && proofs.length === 0) {
      return jsonResponse(
        {
          error: {
            code: "proof_required_for_manual_review",
            message: "A revisão manual exige um comprovativo submetido e conferência no extrato bancário.",
          },
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const receiptId = createOpaqueId("rcp", 20);
    const receiptCode = createReceiptCode();
    const auditPayload = JSON.stringify({
      source: parsed.data.source,
      verified_by: parsed.data.verified_by,
      bank_transaction_id: parsed.data.bank_transaction_id,
      booked_at: parsed.data.booked_at,
    });

    const updatePayment = db
      .update(payments)
      .set({
        status: "paid",
        providerTransactionId: parsed.data.bank_transaction_id,
        updatedAt: now,
      })
      .where(and(eq(payments.id, record.paymentId), eq(payments.status, "pending")));
    const updateInstruction = db
      .update(bankTransferInstructions)
      .set({
        status: "verified",
        verifiedAt: now,
        verifiedBy: parsed.data.verified_by,
        verificationSource: parsed.data.source,
        bankTransactionId: parsed.data.bank_transaction_id,
        statementBookedAt: parsed.data.booked_at,
        updatedAt: now,
      })
      .where(eq(bankTransferInstructions.id, record.instructionId));
    const reviewProofs = db
      .update(bankTransferProofs)
      .set({ status: "verified", reviewedAt: now })
      .where(eq(bankTransferProofs.instructionId, record.instructionId));
    const insertReceipt = db.insert(paymentReceipts).values({
      id: receiptId,
      receiptCode,
      paymentId: record.paymentId,
      schoolId: record.schoolId,
      studentId: record.studentId,
      invoiceId: record.invoiceId,
      issuedAt: now,
    });
    const verifiedEvent = db.insert(paymentEvents).values({
      paymentId: record.paymentId,
      type: "bank_transfer.verified",
      payload: auditPayload,
      createdAt: now,
    });
    const receiptEvent = db.insert(paymentEvents).values({
      paymentId: record.paymentId,
      type: "receipt.issued",
      payload: JSON.stringify({ receipt_code: receiptCode }),
      createdAt: now,
    });

    if (record.invoiceId) {
      await db.batch([
        updatePayment,
        updateInstruction,
        reviewProofs,
        db
          .update(studentInvoices)
          .set({ status: "paid", updatedAt: now })
          .where(eq(studentInvoices.id, record.invoiceId)),
        insertReceipt,
        verifiedEvent,
        receiptEvent,
      ]);
    } else {
      await db.batch([
        updatePayment,
        updateInstruction,
        reviewProofs,
        insertReceipt,
        verifiedEvent,
        receiptEvent,
      ]);
    }

    return verifiedResponse(
      {
        paymentId: record.paymentId,
        receiptCode,
        issuedAt: now,
        amountMinor: record.amountMinor,
        currency: record.currency,
        bankTransactionId: parsed.data.bank_transaction_id,
      },
      request.url,
      false,
    );
  } catch (error) {
    console.error("bank_transfer_verification_failed", error);
    return jsonResponse(
      {
        error: {
          code: "bank_transfer_verification_failed",
          message: "Não foi possível confirmar a transferência.",
        },
      },
      { status: 500 },
    );
  }
}
