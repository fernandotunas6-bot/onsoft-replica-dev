import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  bankTransferInstructions,
  emisTransactions,
  paymentEvents,
  paymentReceipts,
  payments,
  studentInvoices,
} from "@/db/schema";
import {
  findActiveBankAccount,
  getBankTransferDetails,
  publicBankTransfer,
} from "@/lib/bank-transfers";
import { createTransferReference } from "@/lib/identifiers";
import { createCheckoutToken, createPaymentId, corsHeaders, jsonResponse } from "@/lib/payflow";
import { resolveStudentSession } from "@/lib/student-session";
import { emisMethods, initiateEmisSandbox } from "@/lib/providers/emis";
import { getTransferExpiryHours, isSandboxRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const studentPaymentMethods = [...emisMethods, "bank_transfer"] as const;

const paymentSchema = z.object({
  invoice_id: z.string().trim().min(3).max(100),
  method: z.enum(studentPaymentMethods),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  try {
    const session = await resolveStudentSession(request);
    if (!session) {
      return jsonResponse(
        { error: { code: "student_session_expired", message: "A sessão expirou. Identifique-se novamente." } },
        { status: 401 },
      );
    }

    const rows = await getDb()
      .select({
        paymentId: payments.id,
        invoiceId: payments.invoiceId,
        invoiceCode: payments.externalReference,
        description: payments.description,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        status: payments.status,
        method: payments.paymentMethod,
        provider: payments.provider,
        merchantReference: payments.merchantReference,
        providerTransactionId: payments.providerTransactionId,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        receiptCode: paymentReceipts.receiptCode,
        receiptIssuedAt: paymentReceipts.issuedAt,
      })
      .from(payments)
      .leftJoin(paymentReceipts, eq(paymentReceipts.paymentId, payments.id))
      .where(
        and(
          eq(payments.schoolId, session.schoolId),
          eq(payments.studentId, session.studentId),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(20);

    return jsonResponse({
      data: {
        items: rows.map((row) => ({
          payment_id: row.paymentId,
          invoice_id: row.invoiceId,
          invoice_code: row.invoiceCode,
          description: row.description,
          amount: row.amountMinor,
          currency: row.currency,
          status: row.status,
          method: row.method,
          provider: row.provider,
          merchant_reference: row.merchantReference,
          provider_transaction_id: row.providerTransactionId,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          receipt_code: row.receiptCode,
          receipt_issued_at: row.receiptIssuedAt,
          verification_url: row.receiptCode
            ? new URL(`/comprovativo/${row.receiptCode}`, request.url).toString()
            : null,
        })),
      },
    });
  } catch (error) {
    console.error("student_payment_history_failed", error);
    return jsonResponse(
      { error: { code: "payment_history_failed", message: "Não foi possível consultar o histórico." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await resolveStudentSession(request);
    if (!session) {
      return jsonResponse(
        { error: { code: "student_session_expired", message: "A sessão expirou. Identifique-se novamente." } },
        { status: 401 },
      );
    }

    const parsed = paymentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        { error: { code: "invalid_payment", message: "Escolha uma cobrança e um método de pagamento disponível." } },
        { status: 400 },
      );
    }

    const db = getDb();
    const [invoice] = await db
      .select({
        id: studentInvoices.id,
        invoiceCode: studentInvoices.invoiceCode,
        description: studentInvoices.description,
        amountMinor: studentInvoices.amountMinor,
        currency: studentInvoices.currency,
        status: studentInvoices.status,
      })
      .from(studentInvoices)
      .where(
        and(
          eq(studentInvoices.id, parsed.data.invoice_id),
          eq(studentInvoices.schoolId, session.schoolId),
          eq(studentInvoices.studentId, session.studentId),
        ),
      )
      .limit(1);
    if (!invoice || !["open", "overdue"].includes(invoice.status)) {
      return jsonResponse(
        { error: { code: "invoice_unavailable", message: "Esta fatura não está disponível para pagamento." } },
        { status: 409 },
      );
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;

    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(payments)
        .where(eq(payments.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        if (
          existing.schoolId !== session.schoolId ||
          existing.studentId !== session.studentId ||
          existing.invoiceId !== invoice.id
        ) {
          return jsonResponse(
            { error: { code: "idempotency_conflict", message: "Esta chave de idempotência já pertence a outra operação." } },
            { status: 409 },
          );
        }

        const [existingEmis] = await db
          .select()
          .from(emisTransactions)
          .where(eq(emisTransactions.paymentId, existing.id))
          .limit(1);
        const metadata = JSON.parse(existing.metadata || "{}") as {
          reference_data?: { entity: string; reference: string } | null;
        };
        const existingTransfer = await getBankTransferDetails(existing.id);

        return jsonResponse({
          data: {
            payment_id: existing.id,
            invoice_id: invoice.id,
            invoice_code: invoice.invoiceCode,
            student_id: session.studentId,
            school_id: session.schoolId,
            amount: existing.amountMinor,
            currency: existing.currency,
            status: existing.status,
            provider: existing.provider,
            provider_transaction_id: existingEmis?.providerTransactionId ?? existing.providerTransactionId,
            merchant_reference: existingEmis?.merchantReference ?? existing.merchantReference,
            method: existing.paymentMethod,
            reference_data: metadata.reference_data ?? null,
            bank_transfer: existingTransfer ? publicBankTransfer(existingTransfer) : null,
          },
        });
      }
    }

    const isBankTransfer = parsed.data.method === "bank_transfer";
    if (!isBankTransfer && !isSandboxRuntime()) {
      return jsonResponse(
        {
          error: {
            code: "payment_provider_not_configured",
            message: "O meio de pagamento ainda não está disponível para esta instituição.",
          },
        },
        { status: 503 },
      );
    }

    const bankAccount = isBankTransfer
      ? await findActiveBankAccount({
          scope: "school",
          schoolId: session.schoolId,
          currency: invoice.currency,
        })
      : null;
    if (isBankTransfer && !bankAccount) {
      return jsonResponse(
        {
          error: {
            code: "bank_transfer_not_configured",
            message: "A instituição ainda não configurou uma conta para transferências nesta moeda.",
          },
        },
        { status: 503 },
      );
    }

    if (isBankTransfer && bankAccount) {
      const paymentId = createPaymentId();
      const transferReference = createTransferReference();
      const now = new Date().toISOString();
      const expiresAt = new Date(
        Date.now() + getTransferExpiryHours() * 60 * 60 * 1000,
      ).toISOString();

      await db.insert(payments).values({
        id: paymentId,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        description: invoice.description,
        externalReference: invoice.invoiceCode,
        sourceApp: "SIGA Plus — Portal do Aluno",
        status: "pending",
        paymentMethod: "bank_transfer",
        provider: "bank_transfer",
        checkoutToken: createCheckoutToken(),
        idempotencyKey,
        metadata: JSON.stringify({ invoice_code: invoice.invoiceCode }),
        schoolId: session.schoolId,
        studentId: session.studentId,
        invoiceId: invoice.id,
        merchantReference: transferReference,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(bankTransferInstructions).values({
        id: `bti_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
        paymentId,
        bankAccountId: bankAccount.id,
        transferReference,
        expectedAmountMinor: invoice.amountMinor,
        currency: invoice.currency,
        status: "awaiting_transfer",
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(paymentEvents).values({
        paymentId,
        type: "bank_transfer.instructions_created",
        payload: JSON.stringify({ reference: transferReference, expires_at: expiresAt }),
        createdAt: now,
      });

      const transfer = await getBankTransferDetails(paymentId);
      if (!transfer) throw new Error("bank_transfer_instruction_missing");

      return jsonResponse(
        {
          data: {
            payment_id: paymentId,
            invoice_id: invoice.id,
            invoice_code: invoice.invoiceCode,
            student_id: session.studentId,
            school_id: session.schoolId,
            amount: invoice.amountMinor,
            currency: invoice.currency,
            status: "pending",
            provider: "bank_transfer",
            provider_transaction_id: null,
            merchant_reference: transferReference,
            method: "bank_transfer",
            reference_data: null,
            bank_transfer: publicBankTransfer(transfer),
          },
        },
        { status: 201 },
      );
    }

    // A transferência bancária respondeu acima (isBankTransfer); aqui só chegam métodos EMIS.
    const emis = initiateEmisSandbox(parsed.data.method as (typeof emisMethods)[number]);
    const paymentId = createPaymentId();
    const now = new Date().toISOString();

    await db.insert(payments).values({
      id: paymentId,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
      description: invoice.description,
      externalReference: invoice.invoiceCode,
      sourceApp: "SIGA Plus — Portal do Aluno",
      status: "pending",
      paymentMethod: parsed.data.method,
      provider: "emis_sandbox",
      checkoutToken: createCheckoutToken(),
      idempotencyKey,
      metadata: JSON.stringify({
        invoice_code: invoice.invoiceCode,
        reference_data: emis.referenceData,
        sandbox: true,
      }),
      schoolId: session.schoolId,
      studentId: session.studentId,
      invoiceId: invoice.id,
      providerTransactionId: emis.transactionId,
      merchantReference: emis.merchantReference,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(emisTransactions).values({
      id: `emtx_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
      paymentId,
      merchantReference: emis.merchantReference,
      providerTransactionId: emis.transactionId,
      method: parsed.data.method,
      status: emis.status,
      responseCode: emis.responseCode,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(paymentEvents).values({
      paymentId,
      type: "payment.emis_initiated",
      payload: JSON.stringify({
        provider: "emis_sandbox",
        method: parsed.data.method,
        merchant_reference: emis.merchantReference,
      }),
      createdAt: now,
    });

    return jsonResponse(
      {
        data: {
          payment_id: paymentId,
          invoice_id: invoice.id,
          invoice_code: invoice.invoiceCode,
          student_id: session.studentId,
          school_id: session.schoolId,
          amount: invoice.amountMinor,
          currency: invoice.currency,
          status: "pending",
          provider: "emis_sandbox",
          provider_transaction_id: emis.transactionId,
          merchant_reference: emis.merchantReference,
          method: parsed.data.method,
          reference_data: emis.referenceData,
          bank_transfer: null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("student_payment_failed", error);
    return jsonResponse(
      { error: { code: "payment_failed", message: "Não foi possível iniciar o pagamento." } },
      { status: 500 },
    );
  }
}
