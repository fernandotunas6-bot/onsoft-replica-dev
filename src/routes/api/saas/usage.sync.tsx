import { createFileRoute } from "@tanstack/react-router";
import { syncAllTenantUsage } from "@/features/saas/usage-sync";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — sincroniza tenant_usage a partir de alunos reais.

export const Route = createFileRoute("/api/saas/usage/sync")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const result = await syncAllTenantUsage();
          return jsonWithCors(request, result, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível sincronizar a utilização.";
          const status = message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: UsageSyncApiPlaceholder,
});

function UsageSyncApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de sincronização de utilização</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        POST autenticado — actualiza tenant_usage por escola.
      </p>
    </main>
  );
}
