import { createFileRoute } from "@tanstack/react-router";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import {
  loadPlatformPeriodDiscounts,
  savePlatformPeriodDiscounts,
} from "@/features/saas/tenant-billing";
import {
  MAX_PERIOD_DISCOUNT_PCT,
  periodDiscountsInputSchema,
} from "@/features/saas/tenant-billing-rules";
import { corsPreflight, jsonWithCors, readJsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — descontos por periodicidade da plataforma, para o ADMIN.

/**
 * Descontos por periodicidade de toda a plataforma (porte da #210, 22/11/2026). O
 * cálculo da cobrança já os lia de `saas_billing_settings.periods`, mas nada os
 * editava. Só administradores da plataforma (com 2FA), antes de ler o corpo.
 */
function failure(request: Request, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 400;
  return jsonWithCors(request, { error: message }, { status, apps: [...APPS], noStore: true });
}

export const Route = createFileRoute("/api/saas/billing-settings")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const db = await loadSgaAdminClient();
          return jsonWithCors(
            request,
            {
              discounts: await loadPlatformPeriodDiscounts(db),
              maxDiscountPct: MAX_PERIOD_DISCOUNT_PCT,
            },
            { apps: [...APPS], noStore: true },
          );
        } catch (error) {
          return failure(request, error, "Não foi possível ler os descontos.");
        }
      },
      POST: async ({ request }) => {
        let userId: string;
        try {
          userId = await requirePlatformAdminFromRequest(request);
        } catch (error) {
          return failure(request, error, "Sem permissão.");
        }
        const body = await readJsonWithCors(request, [...APPS]);
        if (!body.ok) return body.response;
        const parsed = periodDiscountsInputSchema.safeParse(body.value);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Descontos inválidos.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS], noStore: true },
          );
        }
        try {
          const db = await loadSgaAdminClient();
          const discounts = await savePlatformPeriodDiscounts(db, {
            discounts: parsed.data.discounts,
            userId,
          });
          return jsonWithCors(request, { discounts }, { apps: [...APPS], noStore: true });
        } catch (error) {
          return failure(request, error, "Não foi possível guardar os descontos.");
        }
      },
    },
  },
});
