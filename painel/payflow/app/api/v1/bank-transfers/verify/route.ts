import { z } from "zod";

import { corsHeaders, isIntegrationAuthorized, jsonResponse } from "@/lib/payflow";
import { requireAdminPermission } from "@/lib/admin-session";
import { schoolScopeForVerification } from "@/lib/school-scope";
import {
  executeBankTransferVerification,
  verifiedPayload,
} from "@/lib/bank-transfer-verify";
import { reportPayflowEvent } from "@/lib/ops-report";

export const dynamic = "force-dynamic";

const verificationSchema = z.object({
  transfer_reference: z.string().trim().min(12).max(80).transform((value) => value.toUpperCase()),
  amount: z.number().int().positive().max(999_999_999_99),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  bank_transaction_id: z.string().trim().min(3).max(160),
  booked_at: z.string().datetime({ offset: true }),
  source: z.enum(["bank_api", "bank_statement", "manual_review"]),
  verified_by: z.string().trim().min(2).max(160),
  school_id: z.string().trim().min(8).max(80).optional(),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const adminSession = isIntegrationAuthorized(request)
    ? null
    : await requireAdminPermission(request, "reconciliation:write");
  if (!isIntegrationAuthorized(request) && !adminSession) {
    return jsonResponse(
      { error: { code: "unauthorized", message: "Chave de integração ou sessão administrativa com permissão necessária." } },
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

    const scope = schoolScopeForVerification({
      adminSchoolId: adminSession?.schoolId,
      requestedSchoolId: parsed.data.school_id,
    });
    if (!scope.ok) {
      return jsonResponse(
        { error: { code: scope.code, message: scope.message } },
        { status: scope.status },
      );
    }

    const result = await executeBankTransferVerification(parsed.data, {
      adminSession,
      integrationAuthorized: isIntegrationAuthorized(request),
      requiredSchoolId: scope.schoolId,
    });
    if (!result.ok) {
      reportPayflowEvent("bank_transfer.verify.rejected", {
        code: result.code,
        school_id: scope.schoolId,
        source: parsed.data.source,
      });
      return jsonResponse(
        { error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }
    reportPayflowEvent("bank_transfer.verify.ok", {
      school_id: scope.schoolId,
      payment_id: result.paymentId,
      source: parsed.data.source,
      idempotent: result.idempotent,
    });
    return jsonResponse({ data: verifiedPayload(result, request.url) });
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
