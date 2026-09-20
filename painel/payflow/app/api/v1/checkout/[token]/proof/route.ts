import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { submitBankTransferProof } from "@/lib/bank-transfer-proofs";
import { corsHeaders, jsonResponse } from "@/lib/payflow";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const [payment] = await getDb()
      .select({ id: payments.id, provider: payments.provider, status: payments.status })
      .from(payments)
      .where(eq(payments.checkoutToken, token))
      .limit(1);
    if (!payment || payment.provider !== "bank_transfer" || payment.status !== "pending") {
      return jsonResponse(
        { error: { code: "payment_not_found", message: "Transferência pendente não encontrada." } },
        { status: 404 },
      );
    }

    const form = await request.formData();
    const proof = form.get("proof");
    if (!(proof instanceof File)) {
      return jsonResponse(
        { error: { code: "proof_required", message: "Selecione o comprovativo da transferência." } },
        { status: 400 },
      );
    }

    const result = await submitBankTransferProof(payment.id, proof);
    return jsonResponse(
      { data: { proof_id: result.proofId, status: result.status, duplicate: result.duplicate } },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "transfer_proof_failed";
    const clientErrors = new Set([
      "invalid_transfer_proof_size",
      "invalid_transfer_proof_type",
      "bank_transfer_not_awaiting_proof",
      "bank_transfer_expired",
      "bank_transfer_proof_limit_reached",
    ]);
    console.error("checkout_transfer_proof_failed", error);
    return jsonResponse(
      {
        error: {
          code,
          message: clientErrors.has(code)
            ? "O comprovativo não pôde ser aceite. Confirme o formato, tamanho e validade da instrução."
            : "Não foi possível guardar o comprovativo.",
        },
      },
      { status: code === "transfer_proof_storage_unavailable" ? 503 : clientErrors.has(code) ? 409 : 500 },
    );
  }
}
