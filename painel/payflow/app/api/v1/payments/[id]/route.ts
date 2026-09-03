import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { payments } from "@/db/schema";
import {
  corsHeaders,
  isIntegrationAuthorized,
  jsonResponse,
  publicPayment,
  type PaymentRecord,
} from "@/lib/payflow";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isIntegrationAuthorized(request)) {
    return jsonResponse(
      { error: { code: "unauthorized", message: "Chave de API inválida." } },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  try {
    const [payment] = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);

    if (!payment) {
      return jsonResponse(
        { error: { code: "not_found", message: "Pagamento não encontrado." } },
        { status: 404 },
      );
    }

    return jsonResponse({ data: publicPayment(payment as PaymentRecord, request.url) });
  } catch {
    return jsonResponse(
      { error: { code: "internal_error", message: "Não foi possível consultar o pagamento." } },
      { status: 500 },
    );
  }
}
