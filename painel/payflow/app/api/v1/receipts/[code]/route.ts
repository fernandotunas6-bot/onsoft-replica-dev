import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  emisTransactions,
  paymentReceipts,
  payments,
  schools,
  students,
} from "@/db/schema";
import { jsonResponse } from "@/lib/payflow";

export const dynamic = "force-dynamic";

function maskStudentCode(value: string) {
  return value.length >= 4 ? `***${value.slice(-4)}` : "***";
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join(" ");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const normalizedCode = code.trim().toUpperCase();
    if (!/^REC-\d{4}-[A-F0-9]{8,32}$/.test(normalizedCode)) {
      return jsonResponse(
        { error: { code: "invalid_receipt_code", message: "Código de comprovativo inválido." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [record] = await getDb()
      .select({
        receiptId: paymentReceipts.id,
        receiptCode: paymentReceipts.receiptCode,
        issuedAt: paymentReceipts.issuedAt,
        schoolId: paymentReceipts.schoolId,
        studentId: paymentReceipts.studentId,
        invoiceId: paymentReceipts.invoiceId,
        paymentId: payments.id,
        invoiceCode: payments.externalReference,
        description: payments.description,
        customerName: payments.customerName,
        sourceApp: payments.sourceApp,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        status: payments.status,
        method: payments.paymentMethod,
        provider: payments.provider,
        merchantReference: payments.merchantReference,
        providerTransactionId: payments.providerTransactionId,
        schoolCode: schools.publicCode,
        schoolName: schools.name,
        studentCode: students.studentCode,
        studentName: students.fullName,
        emisMerchantReference: emisTransactions.merchantReference,
        emisProviderTransactionId: emisTransactions.providerTransactionId,
      })
      .from(paymentReceipts)
      .innerJoin(payments, eq(payments.id, paymentReceipts.paymentId))
      .leftJoin(schools, eq(schools.id, paymentReceipts.schoolId))
      .leftJoin(students, eq(students.id, paymentReceipts.studentId))
      .leftJoin(emisTransactions, eq(emisTransactions.paymentId, payments.id))
      .where(eq(paymentReceipts.receiptCode, normalizedCode))
      .limit(1);

    if (!record) {
      return jsonResponse(
        { error: { code: "receipt_not_found", message: "Comprovativo não encontrado." } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const studentReceipt = Boolean(record.studentId || record.invoiceId);
    if (
      studentReceipt &&
      (!record.studentCode || !record.studentName || !record.schoolCode || !record.schoolName)
    ) {
      return jsonResponse(
        { error: { code: "receipt_context_unavailable", message: "O comprovativo não possui contexto escolar válido." } },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    return jsonResponse(
      {
        data: {
          valid: true,
          receipt_code: record.receiptCode,
          issued_at: record.issuedAt,
          school:
            record.schoolCode && record.schoolName
              ? { code: record.schoolCode, name: record.schoolName }
              : null,
          student:
            record.studentCode && record.studentName
              ? {
                  code: maskStudentCode(record.studentCode),
                  initials: initials(record.studentName),
                }
              : null,
          payer: {
            label: record.schoolName || initials(record.customerName || "Pagador"),
            source: record.sourceApp,
          },
          invoice_code: record.invoiceCode,
          description: record.description,
          amount: record.amountMinor,
          currency: record.currency,
          status: record.status,
          method: record.method,
          provider: record.provider,
          payment_id: record.paymentId,
          merchant_reference: record.emisMerchantReference ?? record.merchantReference,
          provider_transaction_id:
            record.emisProviderTransactionId ?? record.providerTransactionId,
          verified_at: new Date().toISOString(),
          verification_url: new URL(`/comprovativo/${record.receiptCode}`, request.url).toString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("receipt_verification_failed", error);
    return jsonResponse(
      { error: { code: "receipt_verification_failed", message: "Não foi possível validar o comprovativo." } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
