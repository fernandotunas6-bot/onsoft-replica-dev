import { createFileRoute } from "@tanstack/react-router";
import {
  GATEWAY_SIGNATURE_HEADER,
  GATEWAY_TIMESTAMP_HEADER,
} from "@/features/finance/gateway-webhook-signature";
import { runFinanceGatewayWebhook } from "@/features/finance/gateway-webhook-handler";
import { clientIpFromRequest } from "@/lib/request-ip";

// style-check: route-exempt — webhook HTTP EMIS/Multicaixa (sem shell administrativo).

export const Route = createFileRoute("/api/finance/gateway/confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // O corpo é lido como texto: a assinatura cobre os bytes exactos recebidos.
        const result = await runFinanceGatewayWebhook(
          {
            rawBody: await request.text(),
            timestamp: request.headers.get(GATEWAY_TIMESTAMP_HEADER),
            signature: request.headers.get(GATEWAY_SIGNATURE_HEADER),
          },
          clientIpFromRequest(request),
        );
        return Response.json(
          {
            ok: result.ok,
            message: result.message,
            issues: "issues" in result ? result.issues : undefined,
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
        <span className="font-mono text-xs">{`{ reference, amount, externalId }`}</span> para
        confirmar pagamentos Multicaixa/Unitel. Configure a API key em Definições → Integrações →
        Multicaixa Express.
      </p>
    </main>
  );
}
