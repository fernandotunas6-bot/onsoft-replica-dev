import { createFileRoute } from "@tanstack/react-router";
import { fetchAllSubscriptions } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — subscrições SaaS para o ADMIN.

export const Route = createFileRoute("/api/saas/subscriptions")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const subscriptions = await fetchAllSubscriptions();
          return jsonWithCors(request, { subscriptions }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível listar subscrições.";
          const status =
            message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: SubscriptionsApiPlaceholder,
});

function SubscriptionsApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de subscrições SaaS</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET autenticado. A UI vive no ADMIN.</p>
    </main>
  );
}
