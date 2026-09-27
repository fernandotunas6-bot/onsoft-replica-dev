import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { timingSafeEqual } from "@/lib/timing-safe-equal";

// Aviso (webhook) da AppyPay. A AppyPay não assina os avisos: por isso exigimos
// um token secreto no endereço e confirmamos SEMPRE a cobrança na própria AppyPay
// antes de lançar qualquer pagamento.
const payloadSchema = z
  .object({
    id: z.string().min(1).max(100),
    merchantTransactionId: z.string().max(40).optional(),
  })
  .passthrough();

export const Route = createFileRoute("/api/public/payments/appypay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["APPYPAY_WEBHOOK_TOKEN"]?.trim() ?? "";
        const got = new URL(request.url).searchParams.get("token") ?? "";
        if (!expected || expected.length < 16 || !timingSafeEqual(got, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) return new Response("Invalid payload", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, tipos gerados podem estar desactualizados
        const db = supabaseAdmin as any;
        const { data: row } = await db
          .from("payment_gateway_charges")
          .select("*")
          .or(
            `provider_charge_id.eq.${parsed.data.id.replace(/[^A-Za-z0-9-]/g, "")}` +
              (parsed.data.merchantTransactionId
                ? `,merchant_transaction_id.eq.${parsed.data.merchantTransactionId.replace(/[^A-Za-z0-9]/g, "")}`
                : ""),
          )
          .maybeSingle();
        // Devolvemos 200 mesmo para cobranças desconhecidas, para a AppyPay não repetir sem fim.
        if (!row) return Response.json({ ok: true, known: false });
        if (!row.provider_charge_id) {
          await db
            .from("payment_gateway_charges")
            .update({ provider_charge_id: parsed.data.id })
            .eq("id", row.id);
          row.provider_charge_id = parsed.data.id;
        }
        const { reconcileAppyPayCharge } =
          await import("@/features/finance/appypay-reconcile.server");
        try {
          const result = await reconcileAppyPayCharge(
            db,
            row,
            parsed.data as Record<string, unknown>,
          );
          return Response.json({ ok: true, status: result.status });
        } catch {
          // 500 → a AppyPay volta a tentar mais tarde.
          return new Response("Retry later", { status: 500 });
        }
      },
    },
  },
});
