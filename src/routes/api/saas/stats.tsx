import { createFileRoute } from "@tanstack/react-router";
import { fetchSaaSStats } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — métricas SaaS para o ADMIN.

export const Route = createFileRoute("/api/saas/stats")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const stats = await fetchSaaSStats();
          return jsonWithCors(request, { stats }, { apps: [...APPS] });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível carregar as métricas.";
          const status = message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: StatsApiPlaceholder,
});

function StatsApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de métricas SaaS</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET autenticado para o ADMIN.</p>
    </main>
  );
}
