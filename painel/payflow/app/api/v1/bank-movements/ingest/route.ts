import { z } from "zod";

import { corsHeaders, isIntegrationAuthorized, jsonResponse } from "@/lib/payflow";
import { schoolScopeForVerification } from "@/lib/school-scope";
import {
  executeBankTransferVerification,
  verifiedPayload,
} from "@/lib/bank-transfer-verify";
import { reportPayflowEvent } from "@/lib/ops-report";

export const dynamic = "force-dynamic";

/**
 * Ingestão servidor→servidor de movimentos bancários (fonte `bank_api`).
 * Só chave de integração + `school_id` obrigatório — sem sessão admin.
 */
const movementSchema = z.object({
  transfer_reference: z.string().trim().min(12).max(80).transform((value) => value.toUpperCase()),
  amount: z.number().int().positive().max(999_999_999_99),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  bank_transaction_id: z.string().trim().min(3).max(160),
  booked_at: z.string().datetime({ offset: true }),
  verified_by: z.string().trim().min(2).max(160).default("bank_api_connector"),
  school_id: z.string().trim().min(8).max(80),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  if (!isIntegrationAuthorized(request)) {
    return jsonResponse(
      {
        error: {
          code: "unauthorized",
          message: "Chave de integração PayFlow necessária para ingestão bancária.",
        },
      },
      { status: 401 },
    );
  }

  try {
    const parsed = movementSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: "invalid_bank_movement",
            message: "Confira referência, valor, moeda, movimento e school_id.",
            fields: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const scope = schoolScopeForVerification({
      requestedSchoolId: parsed.data.school_id,
    });
    if (!scope.ok) {
      return jsonResponse(
        { error: { code: scope.code, message: scope.message } },
        { status: scope.status },
      );
    }

    const result = await executeBankTransferVerification(
      {
        transfer_reference: parsed.data.transfer_reference,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        bank_transaction_id: parsed.data.bank_transaction_id,
        booked_at: parsed.data.booked_at,
        source: "bank_api",
        verified_by: parsed.data.verified_by,
        school_id: scope.schoolId,
      },
      {
        adminSession: null,
        integrationAuthorized: true,
        requiredSchoolId: scope.schoolId,
      },
    );

    if (!result.ok) {
      reportPayflowEvent("bank_api.ingest.rejected", {
        code: result.code,
        school_id: scope.schoolId,
      });
      return jsonResponse(
        { error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }

    reportPayflowEvent("bank_api.ingest.ok", {
      school_id: scope.schoolId,
      payment_id: result.paymentId,
      idempotent: result.idempotent,
    });
    return jsonResponse({ data: verifiedPayload(result, request.url) });
  } catch (error) {
    console.error("bank_api_ingest_failed", error);
    return jsonResponse(
      {
        error: {
          code: "bank_api_ingest_failed",
          message: "Não foi possível ingerir o movimento bancário.",
        },
      },
      { status: 500 },
    );
  }
}
