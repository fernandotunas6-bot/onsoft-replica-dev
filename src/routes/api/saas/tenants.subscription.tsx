import { createFileRoute } from "@tanstack/react-router";
import { updateTenantSubscriptionInputSchema } from "@/features/saas/schemas";
import { updateTenantSubscription } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — alteração de plano/trial SaaS para o ADMIN.

export const Route = createFileRoute("/api/saas/tenants/subscription")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithCors(request, { error: "Corpo JSON inválido." }, { status: 400, apps: [...APPS] });
        }
        const parsed = updateTenantSubscriptionInputSchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }
        try {
          const userId = await requirePlatformAdminFromRequest(request);
          await updateTenantSubscription({ ...parsed.data, userId });
          return jsonWithCors(request, { success: true }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível actualizar a subscrição.";
          const status = message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 400;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: TenantSubscriptionApiPlaceholder,
});

function TenantSubscriptionApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de subscrição do tenant</h1>
      <p className="mt-2 text-sm text-muted-foreground">POST autenticado. A UI vive no ADMIN.</p>
    </main>
  );
}
