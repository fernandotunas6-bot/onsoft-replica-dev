import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { submitBankTransferProof } from "@/lib/bank-transfer-proofs";
import { corsHeaders, jsonResponse } from "@/lib/payflow";
import { resolveStudentSession } from "@/lib/student-session";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function proofError(error: unknown) {
  const code = error instanceof Error ? error.message : "transfer_proof_failed";
  const known: Record<string, [number, string]> = {
    invalid_transfer_proof_size: [400, "O comprovativo deve ter entre 32 bytes e 5 MB."],
    invalid_transfer_proof_type: [400, "Envie um ficheiro PDF, JPG, PNG ou WebP válido."],
    bank_transfer_not_awaiting_proof: [409, "Este pagamento já não aceita comprovativos."],
    bank_transfer_expired: [409, "A instrução de transferência expirou."],
    bank_transfer_proof_limit_reached: [409, "O limite de comprovativos para este pagamento foi atingido."],
    transfer_proof_storage_unavailable: [503, "O envio de comprovativos está temporariamente indisponível."],
  };
  const [status, message] = known[code] ?? [500, "Não foi possível guardar o comprovativo."];
  return jsonResponse({ error: { code, message } }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await resolveStudentSession(request);
    if (!session) {
      return jsonResponse(
        { error: { code: "student_session_expired", message: "A sessão expirou. Identifique-se novamente." } },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const [payment] = await getDb()
      .select({ id: payments.id, provider: payments.provider, status: payments.status })
      .from(payments)
      .where(
        and(
          eq(payments.id, id),
          eq(payments.schoolId, session.schoolId),
          eq(payments.studentId, session.studentId),
        ),
      )
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
    console.error("student_transfer_proof_failed", error);
    return proofError(error);
  }
}
