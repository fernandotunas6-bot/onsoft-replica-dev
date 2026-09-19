import { corsHeaders, jsonResponse } from "@/lib/payflow";
import {
  buildSandboxFeedMovements,
  timingSafeEqualString,
} from "@/lib/bank-sandbox-feed";
import { getBankConnectorKey, isSandboxRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/**
 * Feed local para testar `POST /api/v1/bank-movements/pull` sem portal bancário.
 * Só em `PAYFLOW_RUNTIME_MODE=sandbox` + Bearer = `PAYFLOW_BANK_CONNECTOR_KEY`.
 *
 * Query:
 *   school_id (obrigatório)
 *   transfer_reference, amount, currency, bank_transaction_id, booked_at (opcional → 1 movimento)
 * Sem seed → `{ movements: [] }`.
 *
 * Exemplo de URL no servidor PayFlow:
 *   PAYFLOW_BANK_CONNECTOR_URL=http://localhost:3007/api/v1/bank-movements/sandbox-feed?transfer_reference=PF-TF-…&amount=1500000
 */
function authorized(request: Request) {
  const expected = getBankConnectorKey();
  if (expected.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return timingSafeEqualString(supplied, expected);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  if (!isSandboxRuntime()) {
    return jsonResponse(
      {
        error: {
          code: "sandbox_only",
          message: "O feed bancário local só existe em PAYFLOW_RUNTIME_MODE=sandbox.",
        },
      },
      { status: 404 },
    );
  }

  if (!authorized(request)) {
    return jsonResponse(
      {
        error: {
          code: "unauthorized",
          message: "Bearer PAYFLOW_BANK_CONNECTOR_KEY necessário.",
        },
      },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const schoolId = url.searchParams.get("school_id")?.trim() ?? "";
  if (schoolId.length < 8) {
    return jsonResponse(
      { error: { code: "school_required", message: "Indique school_id." } },
      { status: 400 },
    );
  }

  const amountRaw = url.searchParams.get("amount");
  const amount = amountRaw ? Number(amountRaw) : NaN;

  return jsonResponse({
    movements: buildSandboxFeedMovements({
      schoolId,
      transferReference: url.searchParams.get("transfer_reference") ?? "",
      amount,
      currency: url.searchParams.get("currency") ?? "AOA",
      bankTransactionId: url.searchParams.get("bank_transaction_id") ?? "",
      bookedAt: url.searchParams.get("booked_at") ?? "",
    }),
  });
}
