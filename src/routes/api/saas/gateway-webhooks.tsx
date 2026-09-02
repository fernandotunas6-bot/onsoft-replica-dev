import { createFileRoute } from "@tanstack/react-router";
import { fetchGatewayWebhookMetrics } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — métricas gateway cross-tenant para o ADMIN.

export const Route = createFileRoute("/api/saas/gateway-webhooks")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const url = new URL(request.url);
          const limit = Math.min(500, Math.max(50, Number(url.searchParams.get("limit") || 200)));
          const metrics = await fetchGatewayWebhookMetrics(limit);
          return jsonWithCors(request, { metrics }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível carregar métricas de webhook.";
          const status = message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: GatewayWebhooksApiPlaceholder,
});

function GatewayWebhooksApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de webhooks gateway</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET autenticado. A UI vive no ADMIN.</p>
    </main>
  );
}
