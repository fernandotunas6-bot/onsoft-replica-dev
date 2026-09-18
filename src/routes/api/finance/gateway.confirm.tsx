import { createFileRoute } from "@tanstack/react-router";
import { gatewayConfirmInputSchema } from "@/features/finance/gateway-webhook-schemas";
import { runFinanceGatewayWebhook } from "@/features/finance/gateway-webhook-handler";

// style-check: route-exempt — webhook HTTP EMIS/Multicaixa (sem shell administrativo).

export const Route = createFileRoute("/api/finance/gateway/confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, message: "Corpo JSON inválido." }, { status: 400 });
        }

        const parsed = gatewayConfirmInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              ok: false,
              message: "Pedido inválido.",
              issues: parsed.error.flatten().fieldErrors,
            },
            { status: 400 },
          );
        }

        const result = await runFinanceGatewayWebhook(parsed.data);
        return Response.json(
          {
            ok: result.ok,
            message: result.message,
            receiptId: "receiptId" in result ? result.receiptId : undefined,
            receiptNumber: "receiptNumber" in result ? result.receiptNumber : undefined,
            planSettled: "planSettled" in result ? result.planSettled : undefined,
          },
          { status: result.status },
        );
      },
    },
  },
  component: FinanceGatewayPlaceholder,
});

function FinanceGatewayPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">Webhook financeiro</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Envie <span className="font-mono text-xs">POST</span> com{" "}
        <span className="font-mono text-xs">{`{ apiKey, reference, amount, invoiceId? }`}</span>{" "}
        para confirmar pagamentos Multicaixa/Unitel. Configure a API key em Definições → Integrações
        → Multicaixa Express.
      </p>
    </main>
  );
}
