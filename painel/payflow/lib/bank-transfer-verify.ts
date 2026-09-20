import { and, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  bankTransferInstructions,
  bankTransferProofs,
  paymentEvents,
  paymentReceipts,
  payments,
  studentInvoices,
} from "@/db/schema";
import type { requireAdminPermission } from "@/lib/admin-session";
import { createOpaqueId, createReceiptCode } from "@/lib/identifiers";
import { notifySigaSettlementBestEffort } from "@/lib/siga-notify";

export type BankTransferVerificationInput = {
  transfer_reference: string;
  amount: number;
  currency: string;
  bank_transaction_id: string;
  booked_at: string;
  source: "bank_api" | "bank_statement" | "manual_review";
  verified_by: string;
};

export type BankTransferVerificationSuccess = {
  ok: true;
  paymentId: string;
  receiptCode: string;
  issuedAt: string;
  amountMinor: number;
  currency: string;
  bankTransactionId: string | null;
  idempotent: boolean;
};

export type BankTransferVerificationFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type BankTransferVerificationResult =
  | BankTransferVerificationSuccess
  | BankTransferVerificationFailure;

type AdminSession = Awaited<ReturnType<typeof requireAdminPermission>>;

// Scoping por adminSession.schoolId e prevenção de transfer_school_mismatch
export { schoolScopeForVerification } from "./education-isolation";

export function verifiedPayload(record: BankTransferVerificationSuccess, requestUrl: string) {
  return {
    payment_id: record.paymentId,
    status: "paid" as const,
    amount: record.amountMinor,
    currency: record.currency,
    bank_transaction_id: record.bankTransactionId,
    receipt_code: record.receiptCode,
    receipt_issued_at: record.issuedAt,
    verification_url: new URL(`/comprovativo/${record.receiptCode}`, requestUrl).toString(),
    idempotent: record.idempotent,
  };
}

export async function executeBankTransferVerification(
  input: BankTransferVerificationInput,
  ctx: { adminSession: AdminSession; integrationAuthorized: boolean; requiredSchoolId: string },
): Promise<BankTransferVerificationResult> {
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
    .where(eq(bankTransferInstructions.transferReference, input.transfer_reference))
    .limit(1);

  if (!record || record.provider !== "bank_transfer") {
    return {
      ok: false,
      status: 404,
      code: "transfer_not_found",
      message: "Referência de transferência não encontrada.",
    };
  }

  if (record.schoolId !== ctx.requiredSchoolId) {
    return {
      ok: false,
      status: 403,
      code: "transfer_school_mismatch",
      message: "Esta transferência não pertence à escola da sessão administrativa.",
    };
  }

  if (
    ctx.adminSession &&
    input.source === "manual_review" &&
    ctx.adminSession.role !== "finance_admin"
  ) {
    return {
      ok: false,
      status: 403,
      code: "manual_review_requires_finance_admin",
      message: "A confirmação manual no extrato exige o papel finance_admin (Administrador SIGA).",
    };
  }

  if (
    record.expectedAmountMinor !== input.amount ||
    record.amountMinor !== input.amount ||
    record.expectedCurrency !== input.currency ||
    record.currency !== input.currency
  ) {
    return {
      ok: false,
      status: 409,
      code: "transfer_mismatch",
      message: "O valor ou a moeda do movimento não corresponde à instrução de pagamento.",
    };
  }

  if (record.instructionStatus === "verified" || record.paymentStatus === "paid") {
    if (
      record.instructionStatus === "verified" &&
      record.paymentStatus === "paid" &&
      record.existingBankTransactionId === input.bank_transaction_id &&
      record.receiptCode &&
      record.receiptIssuedAt
    ) {
      notifySigaSettlementBestEffort({
        event: "payment.paid",
        schoolId: record.schoolId,
        invoiceId: record.invoiceId,
        paymentId: record.paymentId,
        amountMinor: record.amountMinor,
        currency: record.currency,
        receiptCode: record.receiptCode,
      });
      return {
        ok: true,
        paymentId: record.paymentId,
        receiptCode: record.receiptCode,
        issuedAt: record.receiptIssuedAt,
        amountMinor: record.amountMinor,
        currency: record.currency,
        bankTransactionId: record.existingBankTransactionId,
        idempotent: true,
      };
    }
    return {
      ok: false,
      status: 409,
      code: "transfer_already_processed",
      message: "Esta transferência já foi processada com outros dados.",
    };
  }

  if (record.paymentStatus !== "pending") {
    return {
      ok: false,
      status: 409,
      code: "payment_not_pending",
      message: "O pagamento já não está pendente.",
    };
  }

  const [transactionConflict] = await db
    .select({ id: bankTransferInstructions.id })
    .from(bankTransferInstructions)
    .where(
      and(
        eq(bankTransferInstructions.bankTransactionId, input.bank_transaction_id),
        ne(bankTransferInstructions.id, record.instructionId),
      ),
    )
    .limit(1);
  if (transactionConflict) {
    return {
      ok: false,
      status: 409,
      code: "bank_transaction_already_used",
      message: "Este movimento bancário já confirmou outro pagamento.",
    };
  }

  const proofs = await db
    .select({ id: bankTransferProofs.id })
    .from(bankTransferProofs)
    .where(eq(bankTransferProofs.instructionId, record.instructionId))
    .limit(3);
  if (input.source === "manual_review" && proofs.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "proof_required_for_manual_review",
      message: "A revisão manual exige um comprovativo submetido e conferência no extrato bancário.",
    };
  }

  const now = new Date().toISOString();
  const receiptId = createOpaqueId("rcp", 20);
  const receiptCode = createReceiptCode();
  const auditPayload = JSON.stringify({
    source: input.source,
    verified_by: input.verified_by,
    bank_transaction_id: input.bank_transaction_id,
    booked_at: input.booked_at,
    admin_role: ctx.adminSession?.role ?? null,
    admin_user_id: ctx.adminSession?.userId ?? null,
    school_id: record.schoolId,
  });

  const updatePayment = db
    .update(payments)
    .set({
      status: "paid",
      providerTransactionId: input.bank_transaction_id,
      updatedAt: now,
    })
    .where(and(eq(payments.id, record.paymentId), eq(payments.status, "pending")));
  const updateInstruction = db
    .update(bankTransferInstructions)
    .set({
      status: "verified",
      verifiedAt: now,
      verifiedBy: input.verified_by,
      verificationSource: input.source,
      bankTransactionId: input.bank_transaction_id,
      statementBookedAt: input.booked_at,
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

  notifySigaSettlementBestEffort({
    event: "payment.paid",
    schoolId: record.schoolId,
    invoiceId: record.invoiceId,
    paymentId: record.paymentId,
    amountMinor: record.amountMinor,
    currency: record.currency,
    receiptCode,
  });
  return {
    ok: true,
    paymentId: record.paymentId,
    receiptCode,
    issuedAt: now,
    amountMinor: record.amountMinor,
    currency: record.currency,
    bankTransactionId: input.bank_transaction_id,
    idempotent: false,
  };
}
