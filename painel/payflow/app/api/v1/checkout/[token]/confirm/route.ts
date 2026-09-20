import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { paymentEvents, payments } from "@/db/schema";
import { corsHeaders, jsonResponse } from "@/lib/payflow";
import { isSandboxRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const confirmationSchema = z.object({
  method: z.enum(["card", "mobile_wallet", "bank_transfer"]),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSandboxRuntime()) {
    return jsonResponse(
      { error: { code: "confirmation_not_available", message: "A confirmação é feita exclusivamente pelo provedor." } },
      { status: 404 },
    );
  }

  const { token } = await context.params;
  const parsed = confirmationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonResponse(
      { error: { code: "invalid_method", message: "Escolha um método de pagamento válido." } },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const [current] = await db
      .select()
      .from(payments)
      .where(eq(payments.checkoutToken, token))
      .limit(1);

    if (!current) {
      return jsonResponse(
        { error: { code: "not_found", message: "Link de pagamento inválido ou expirado." } },
        { status: 404 },
      );
    }

    if (current.provider !== "emis_sandbox") {
      return jsonResponse(
        {
          error: {
            code: "confirmation_not_available",
            message: "A transferência só pode ser confirmada após validação do movimento bancário.",
          },
        },
        { status: 404 },
      );
    }

    if (current.status === "paid") {
      return jsonResponse({ data: { id: current.id, status: current.status } });
    }

    const now = new Date().toISOString();
    const [updated] = await db
      .update(payments)
      .set({ status: "paid", paymentMethod: parsed.data.method, updatedAt: now })
      .where(eq(payments.id, current.id))
      .returning();

    await db.insert(paymentEvents).values({
      paymentId: current.id,
      type: "payment.paid",
      payload: JSON.stringify({ status: "paid", method: parsed.data.method, sandbox: true }),
      createdAt: now,
    });

    return jsonResponse({ data: { id: updated.id, status: updated.status } });
  } catch {
    return jsonResponse(
      { error: { code: "internal_error", message: "Não foi possível concluir o teste." } },
      { status: 500 },
    );
  }
}
