import { createFileRoute } from "@tanstack/react-router";
import { fetchActivePlans } from "@/features/saas/catalog";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["web", "admin"] as const;

// style-check: route-exempt — catálogo público de planos SaaS.

export const Route = createFileRoute("/api/saas/plans")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          const plans = await fetchActivePlans();
          return jsonWithCors(request, { plans }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível carregar os planos.";
          return jsonWithCors(
            request,
            { error: message, plans: [] },
            { status: 500, apps: [...APPS] },
          );
        }
      },
    },
  },
  component: PlansApiPlaceholder,
});

function PlansApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de planos</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET devolve o catálogo activo.</p>
    </main>
  );
}
