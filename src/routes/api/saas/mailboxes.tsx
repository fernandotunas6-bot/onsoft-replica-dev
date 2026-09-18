import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { createMailbox, suspendMailbox } from "@/features/saas/mailbox-providers";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";

// style-check: route-exempt — endpoints para gestão de caixas profissionais (Fase 5)

const APPS = ["web", "admin"] as const;

const provisionSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
});

export const Route = createFileRoute("/api/saas/mailboxes")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),

      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
        } catch {
          return jsonWithCors(
            request,
            { error: "Não autorizado." },
            { status: 401, apps: [...APPS] },
          );
        }

        const db = await loadSgaAdminClient();
        const url = new URL(request.url);
        const tenantId = url.searchParams.get("tenantId");

        let query = db
          .from("tenant_mailboxes")
          .select(
            "id, tenant_id, email, display_name, provider, status, created_at, tenants(name, slug)",
          );

        if (tenantId) {
          query = query.eq("tenant_id", tenantId);
        }

        const { data, error } = await query.order("created_at", { ascending: false });

        if (error) {
          return jsonWithCors(request, { error: error.message }, { status: 500, apps: [...APPS] });
        }

        return jsonWithCors(request, { mailboxes: data }, { apps: [...APPS] });
      },

      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithCors(
            request,
            { error: "JSON inválido." },
            { status: 400, apps: [...APPS] },
          );
        }

        const parsed = provisionSchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }

        try {
          // Apenas platform admins podem forçar via API (as escolas usam a server function directamente)
          await requirePlatformAdminFromRequest(request);
        } catch {
          return jsonWithCors(
            request,
            { error: "Não autorizado." },
            { status: 401, apps: [...APPS] },
          );
        }

        const db = await loadSgaAdminClient();
        const { data: tenant } = await db
          .from("tenants")
          .select("slug")
          .eq("id", parsed.data.tenantId)
          .maybeSingle();

        if (!tenant) {
          return jsonWithCors(
            request,
            { error: "Tenant não encontrado." },
            { status: 404, apps: [...APPS] },
          );
        }

        const result = await createMailbox({
          tenantId: parsed.data.tenantId,
          tenantSlug: tenant.slug,
          email: parsed.data.email,
          displayName: parsed.data.displayName,
        });

        if (!result.ok) {
          return jsonWithCors(request, { error: result.reason }, { status: 500, apps: [...APPS] });
        }

        // Guardar na BD
        await db.from("tenant_mailboxes").insert({
          tenant_id: parsed.data.tenantId,
          email: parsed.data.email,
          display_name: parsed.data.displayName,
          provider: result.provider,
          provider_account_id: result.providerAccountId,
          status: "active",
        });

        return jsonWithCors(request, { success: true }, { apps: [...APPS] });
      },
    },
  },
  component: () => (
    <main className="p-8 text-center">
      <h1 className="font-bold">Mailboxes API</h1>
    </main>
  ),
});
