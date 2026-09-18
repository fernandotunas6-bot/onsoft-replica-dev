import { createFileRoute } from "@tanstack/react-router";
import { backfillTenantSubscriptions } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — backfill de subscrições SaaS para o ADMIN.

export const Route = createFileRoute("/api/saas/subscriptions/backfill")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        try {
          const actorUserId = await requirePlatformAdminFromRequest(request);
          const result = await backfillTenantSubscriptions({ actorUserId });
          return jsonWithCors(request, result, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível sincronizar subscrições.";
          const status =
            message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: SubscriptionsBackfillApiPlaceholder,
});

function SubscriptionsBackfillApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">Backfill de subscrições</h1>
      <p className="mt-2 text-sm text-muted-foreground">POST autenticado. A UI vive no ADMIN.</p>
    </main>
  );
}
