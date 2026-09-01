import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import {
  createEmailRoute,
  deleteEmailRoute,
  buildInstitutionalAddress,
  resolveCloudflareCredentials,
} from "@/features/saas/email-routing";
import { getPlatformDomain } from "@/lib/saas/platform-domain";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

// style-check: route-exempt — gestão de rotas de e-mail institucional.

const APPS = ["web", "admin"] as const;

const createRouteBodySchema = z.object({
  tenantId: z.string().uuid(),
  forwardTo: z.string().email("E-mail de destino inválido."),
});

const deleteRouteBodySchema = z.object({
  routeId: z.string().min(1),
  tenantId: z.string().uuid(),
});

export const Route = createFileRoute("/api/saas/email/routes")({
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

        const parsed = createRouteBodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }

        // Carregar slug do tenant
        const db = await loadSgaAdminClient();
        const { data: tenant } = await db
          .from("tenants")
          .select("slug")
          .eq("id", parsed.data.tenantId)
          .maybeSingle();

        if (!tenant?.slug) {
          return jsonWithCors(
            request,
            { error: "Escola não encontrada." },
            { status: 404, apps: [...APPS] },
          );
        }

        const institutionalAddress = buildInstitutionalAddress(
          String(tenant.slug),
          getPlatformDomain(),
        );

        const result = await createEmailRoute({
          institutionalAddress,
          forwardTo: parsed.data.forwardTo,
          tenantSlug: String(tenant.slug),
          tenantId: parsed.data.tenantId,
        });

        const status = result.ok ? 200 : 400;
        return jsonWithCors(request, result, { status, apps: [...APPS] });
      },

      DELETE: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithCors(request, { error: "Corpo JSON inválido." }, { status: 400, apps: [...APPS] });
        }

        const parsed = deleteRouteBodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }

        const creds = resolveCloudflareCredentials();
        if (creds) {
          await deleteEmailRoute(parsed.data.routeId, creds.zoneId, creds.apiToken);
        }

        // Desactivar na BD
        const db = await loadSgaAdminClient();
        await db
          .from("school_email_routes")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("cloudflare_route_id", parsed.data.routeId)
          .eq("tenant_id", parsed.data.tenantId);

        return jsonWithCors(request, { ok: true }, { apps: [...APPS] });
      },
    },
  },
  component: EmailRoutesApiPlaceholder,
});

function EmailRoutesApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API Rotas de E-mail</h1>
      <p className="mt-2 text-sm text-muted-foreground">POST para criar, DELETE para remover. A UI vive no painel da escola.</p>
    </main>
  );
}
