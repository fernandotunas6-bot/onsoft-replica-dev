import { createFileRoute } from "@tanstack/react-router";
import { fetchSaasAuditLogs } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — auditoria SaaS para o ADMIN.

export const Route = createFileRoute("/api/saas/audit-logs")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const url = new URL(request.url);
          // `actions=a,b` filtra por acção (ex.: pedidos de mudança de plano), com
          // um tecto maior porque o resultado é pequeno e não deve ficar enterrado.
          const actions = (url.searchParams.get("actions") ?? "")
            .split(",")
            .map((a) => a.trim())
            .filter((a) => /^[A-Za-z_]{3,60}$/.test(a))
            .slice(0, 10);
          const cap = actions.length ? 500 : 100;
          const limit = Math.min(cap, Math.max(1, Number(url.searchParams.get("limit") || 50)));
          const logs = await fetchSaasAuditLogs(limit, actions);
          return jsonWithCors(request, { logs }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível carregar a auditoria.";
          const status =
            message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: AuditLogsApiPlaceholder,
});

function AuditLogsApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de auditoria SaaS</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET autenticado. A UI vive no ADMIN.</p>
    </main>
  );
}
