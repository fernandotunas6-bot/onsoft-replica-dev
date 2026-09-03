import { and, desc, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  bankTransferInstructions,
  emisTransactions,
  paymentReceipts,
  payments,
} from "@/db/schema";
import { corsHeaders, isIntegrationAuthorized, jsonResponse } from "@/lib/payflow";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["all", "pending", "paid", "failed", "refunded"]);

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  if (!isIntegrationAuthorized(request)) {
    return jsonResponse(
      { error: { code: "unauthorized", message: "Chave de integração inválida." } },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim().toLowerCase() || "all";
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
      : 50;

    if (!allowedStatuses.has(status)) {
      return jsonResponse(
        { error: { code: "invalid_status", message: "Estado de pagamento inválido." } },
        { status: 400 },
      );
    }

    const filters = [isNotNull(payments.schoolId)];
    if (status !== "all") filters.push(eq(payments.status, status));

    const rows = await getDb()
      .select({
        paymentId: payments.id,
        schoolId: payments.schoolId,
        studentId: payments.studentId,
        invoiceId: payments.invoiceId,
        invoiceCode: payments.externalReference,
        description: payments.description,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        status: payments.status,
        method: payments.paymentMethod,
        provider: payments.provider,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        merchantReference: emisTransactions.merchantReference,
        providerTransactionId: emisTransactions.providerTransactionId,
        providerStatus: emisTransactions.status,
        responseCode: emisTransactions.responseCode,
        transferReference: bankTransferInstructions.transferReference,
        transferStatus: bankTransferInstructions.status,
        transferBankTransactionId: bankTransferInstructions.bankTransactionId,
        transferVerifiedAt: bankTransferInstructions.verifiedAt,
        transferVerificationSource: bankTransferInstructions.verificationSource,
        receiptCode: paymentReceipts.receiptCode,
        receiptIssuedAt: paymentReceipts.issuedAt,
      })
      .from(payments)
      .leftJoin(emisTransactions, eq(emisTransactions.paymentId, payments.id))
      .leftJoin(bankTransferInstructions, eq(bankTransferInstructions.paymentId, payments.id))
      .leftJoin(paymentReceipts, eq(paymentReceipts.paymentId, payments.id))
      .where(and(...filters))
      .orderBy(desc(payments.createdAt))
      .limit(limit);

    const items = rows.map((row) => {
      const providerConfirmed = row.provider === "bank_transfer"
        ? row.transferStatus === "verified"
        : row.providerStatus === "successful";
      const reconciliationStatus = row.status === "paid" && providerConfirmed && row.receiptCode
        ? "reconciled"
        : row.status === "paid" || row.transferStatus === "proof_submitted"
          ? "attention"
          : row.status === "pending"
            ? "awaiting"
            : "closed";
      return {
        payment_id: row.paymentId,
        school_id: row.schoolId,
        student_id: row.studentId,
        invoice_id: row.invoiceId,
        invoice_code: row.invoiceCode,
        description: row.description,
        amount: row.amountMinor,
        currency: row.currency,
        status: row.status,
        method: row.method,
        provider: row.provider,
        merchant_reference: row.transferReference ?? row.merchantReference,
        provider_transaction_id:
          row.transferBankTransactionId ?? row.providerTransactionId,
        provider_status: row.transferStatus ?? row.providerStatus,
        response_code: row.responseCode,
        verification_source: row.transferVerificationSource,
        transfer_verified_at: row.transferVerifiedAt,
        receipt_code: row.receiptCode,
        receipt_issued_at: row.receiptIssuedAt,
        reconciliation_status: reconciliationStatus,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        verification_url: row.receiptCode
          ? new URL(`/comprovativo/${row.receiptCode}`, request.url).toString()
          : null,
      };
    });

    return jsonResponse({
      data: {
        summary: {
          records: items.length,
          paid_amount: items
            .filter((item) => item.status === "paid")
            .reduce((total, item) => total + item.amount, 0),
          pending_amount: items
            .filter((item) => item.status === "pending")
            .reduce((total, item) => total + item.amount, 0),
          reconciled: items.filter((item) => item.reconciliation_status === "reconciled").length,
          attention: items.filter((item) => item.reconciliation_status === "attention").length,
        },
        items,
      },
    });
  } catch (error) {
    console.error("reconciliation_query_failed", error);
    return jsonResponse(
      { error: { code: "reconciliation_failed", message: "Não foi possível consultar a conciliação." } },
      { status: 500 },
    );
  }
}
