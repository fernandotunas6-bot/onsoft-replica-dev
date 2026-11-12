import { createFileRoute } from "@tanstack/react-router";
import {
  GATEWAY_SIGNATURE_HEADER,
  GATEWAY_TIMESTAMP_HEADER,
} from "@/features/finance/gateway-webhook-signature";
import { runFinanceGatewayWebhook } from "@/features/finance/gateway-webhook-handler";
import { clientIpFromRequest } from "@/lib/request-ip";
import { BODY_LIMITS, readTextBodyLimited, rejectedBody } from "@/lib/read-json-body";

// style-check: route-exempt — webhook HTTP Unitel Money (alias dedicado).

export const Route = createFileRoute("/api/finance/gateway/unitel/confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // O corpo é lido como texto: a assinatura cobre os bytes exactos recebidos.
        const raw = await readTextBodyLimited(request, BODY_LIMITS.webhook);
        if (!raw.ok) {
          const { status, message } = rejectedBody(raw.reason);
          return Response.json({ ok: false, message }, { status });
        }
        const result = await runFinanceGatewayWebhook(
          {
            rawBody: raw.text,
            timestamp: request.headers.get(GATEWAY_TIMESTAMP_HEADER),
            signature: request.headers.get(GATEWAY_SIGNATURE_HEADER),
            channel: "unitel_money",
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
  component: UnitelGatewayPlaceholder,
});

function UnitelGatewayPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">Webhook Unitel Money</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Envie <span className="font-mono text-xs">POST</span> com{" "}
        <span className="font-mono text-xs">{`{ reference, amount, externalId }`}</span> para
        confirmar pagamentos Unitel. A API key está em Definições → Integrações → Unitel Money.
      </p>
    </main>
  );
}
