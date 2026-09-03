import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { bankTransferInstructions, paymentEvents, payments } from "@/db/schema";
import {
  findActiveBankAccount,
  getBankTransferDetails,
  publicBankTransfer,
} from "@/lib/bank-transfers";
import { createTransferReference } from "@/lib/identifiers";
import {
  corsHeaders,
  createCheckoutToken,
  createPaymentId,
  isIntegrationAuthorized,
  jsonResponse,
  publicPayment,
  type PaymentRecord,
} from "@/lib/payflow";
import { getTransferExpiryHours, isSandboxRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const createPaymentSchema = z
  .object({
    amount: z.number().int().positive().max(999_999_999_99),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("AOA"),
    description: z.string().trim().min(2).max(180),
    customer: z
      .object({
        name: z.string().trim().max(120).optional().default(""),
        email: z.string().trim().email().or(z.literal("")).optional().default(""),
        phone: z.string().trim().max(30).optional().default(""),
      })
      .optional()
      .default({}),
    external_reference: z.string().trim().max(100).optional().default(""),
    source_app: z.string().trim().max(80).optional().default("API"),
    payment_method: z.enum(["bank_transfer", "sandbox"]).default("bank_transfer"),
    purpose: z.enum(["school_subscription", "external_charge"]).default("school_subscription"),
    school_id: z.string().trim().min(3).max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .superRefine((value, context) => {
    if (value.purpose === "school_subscription" && !value.school_id) {
      context.addIssue({ code: "custom", path: ["school_id"], message: "A escola pagadora é obrigatória." });
    }
  });

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro inesperado";
  if (message.includes("no such table")) {
    return jsonResponse(
      { error: { code: "database_unavailable", message: "A base de dados ainda não está pronta." } },
      { status: 503 },
    );
  }
  return jsonResponse(
    { error: { code: "internal_error", message: "Não foi possível processar a cobrança." } },
    { status: 500 },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  if (!isIntegrationAuthorized(request)) {
    return jsonResponse(
      { error: { code: "unauthorized", message: "Chave de API inválida." } },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 20;
    const rows = await getDb()
      .select()
      .from(payments)
      .orderBy(desc(payments.createdAt))
      .limit(limit);

    return jsonResponse({ data: rows.map((row) => publicPayment(row as PaymentRecord, request.url)) });
  } catch (error) {
    return databaseError(error);
  }
}

export async function POST(request: Request) {
  if (!isIntegrationAuthorized(request)) {
    return jsonResponse(
      { error: { code: "unauthorized", message: "Chave de API inválida." } },
      { status: 401 },
    );
  }

  try {
    const parsed = createPaymentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "Confira os dados enviados.",
            fields: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const db = getDb();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(payments)
        .where(eq(payments.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        const existingTransfer = await getBankTransferDetails(existing.id);
        return jsonResponse({
          data: {
            ...publicPayment(existing as PaymentRecord, request.url),
            bank_transfer: existingTransfer ? publicBankTransfer(existingTransfer) : null,
          },
        });
      }
    }

    if (parsed.data.payment_method === "sandbox" && !isSandboxRuntime()) {
      return jsonResponse(
        {
          error: {
            code: "payment_provider_not_configured",
            message: "O modo de simulação não está disponível neste ambiente.",
          },
        },
        { status: 503 },
      );
    }

    const bankAccount = parsed.data.payment_method === "bank_transfer"
      ? await findActiveBankAccount({ scope: "platform", currency: parsed.data.currency })
      : null;
    if (parsed.data.payment_method === "bank_transfer" && !bankAccount) {
      return jsonResponse(
        {
          error: {
            code: "bank_transfer_not_configured",
            message: "A conta de recebimento da plataforma ainda não foi configurada.",
          },
        },
        { status: 503 },
      );
    }

    const now = new Date().toISOString();
    const paymentId = createPaymentId();
    const checkoutToken = createCheckoutToken();
    const transferReference = bankAccount ? createTransferReference() : null;
    const [payment] = await db
      .insert(payments)
      .values({
        id: paymentId,
        amountMinor: parsed.data.amount,
        currency: parsed.data.currency,
        description: parsed.data.description,
        customerName: parsed.data.customer.name ?? "",
        customerEmail: parsed.data.customer.email ?? "",
        customerPhone: parsed.data.customer.phone ?? "",
        externalReference: parsed.data.external_reference,
        sourceApp: parsed.data.source_app,
        status: "pending",
        paymentMethod: parsed.data.payment_method,
        provider: bankAccount ? "bank_transfer" : "emis_sandbox",
        checkoutToken,
        idempotencyKey,
        metadata: JSON.stringify({ ...parsed.data.metadata, purpose: parsed.data.purpose }),
        schoolId: parsed.data.school_id ?? null,
        merchantReference: transferReference,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (bankAccount && transferReference) {
      await db.insert(bankTransferInstructions).values({
        id: `bti_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
        paymentId,
        bankAccountId: bankAccount.id,
        transferReference,
        expectedAmountMinor: parsed.data.amount,
        currency: parsed.data.currency,
        status: "awaiting_transfer",
        expiresAt: new Date(
          Date.now() + getTransferExpiryHours() * 60 * 60 * 1000,
        ).toISOString(),
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(paymentEvents).values({
      paymentId: payment.id,
      type: bankAccount ? "bank_transfer.instructions_created" : "payment.created",
      payload: JSON.stringify({
        status: "pending",
        source_app: payment.sourceApp,
        reference: transferReference,
      }),
      createdAt: now,
    });

    const transfer = bankAccount ? await getBankTransferDetails(payment.id) : null;

    return jsonResponse(
      {
        data: {
          ...publicPayment(payment as PaymentRecord, request.url),
          bank_transfer: transfer ? publicBankTransfer(transfer) : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return databaseError(error);
  }
}
