import { createFileRoute } from "@tanstack/react-router";
import { fetchBillingSettings, saveBillingSettings } from "@/features/saas/catalog";
import { billingSettingsInputSchema } from "@/features/saas/schemas";
import { normalizeBillingSettings } from "@/features/saas/billing-periods";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — configuração de cobrança da plataforma, para o ADMIN.

function failure(request: Request, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 400;
  return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
}

export const Route = createFileRoute("/api/saas/billing-settings")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          return jsonWithCors(
            request,
            { settings: await fetchBillingSettings() },
            { apps: [...APPS] },
          );
        } catch (error) {
          return failure(request, error, "Não foi possível ler a configuração.");
        }
      },
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithCors(
            request,
            { error: "Corpo JSON inválido." },
            { status: 400, apps: [...APPS] },
          );
        }
        const parsed = billingSettingsInputSchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Configuração inválida.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }
        try {
          const userId = await requirePlatformAdminFromRequest(request);
          const settings = await saveBillingSettings({
            settings: normalizeBillingSettings(parsed.data),
            userId,
          });
          return jsonWithCors(request, { settings }, { apps: [...APPS] });
        } catch (error) {
          return failure(request, error, "Não foi possível guardar a configuração.");
        }
      },
    },
  },
});
