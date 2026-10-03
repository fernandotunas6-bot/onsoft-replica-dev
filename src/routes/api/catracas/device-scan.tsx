import { createFileRoute } from "@tanstack/react-router";
import { validateGatePassDeviceInputSchema } from "@/features/catracas/schemas";
import { runDeviceGatePassWebhook } from "@/features/catracas/device-webhook-handler";
import { clientIpFromRequest } from "@/lib/request-ip";

// style-check: route-exempt — endpoint HTTP para leitores físicos (sem shell administrativo).

export const Route = createFileRoute("/api/catracas/device-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ granted: false, reason: "Corpo JSON inválido." }, { status: 400 });
        }

        const parsed = validateGatePassDeviceInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              granted: false,
              reason: "Pedido inválido.",
              issues: parsed.error.flatten().fieldErrors,
            },
            { status: 400 },
          );
        }

        try {
          const result = await runDeviceGatePassWebhook(parsed.data, clientIpFromRequest(request));
          return Response.json(result, { status: result.rateLimited ? 429 : 200 });
        } catch (error) {
          console.error("[api/catracas/device-scan]", error);
          return Response.json(
            { granted: false, reason: "Erro interno ao validar passe." },
            { status: 500 },
          );
        }
      },
    },
  },
  component: DeviceScanApiPlaceholder,
});

function DeviceScanApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">Webhook de catracas</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Envie <span className="font-mono text-xs">POST</span> com{" "}
        <span className="font-mono text-xs">{`{ apiKey, token, direction }`}</span> para validar
        cartões físicos. O daemon Python local também usa este endpoint.
      </p>
    </main>
  );
}
