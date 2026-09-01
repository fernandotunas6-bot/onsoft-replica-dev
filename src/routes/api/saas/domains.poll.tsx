import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { pollCustomDomainDns, persistPollResult } from "@/features/saas/domain-polling";
import { domainDnsInstructions } from "@/features/saas/platform-ops";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

// style-check: route-exempt — polling DNS de domínio personalizado.

const APPS = ["web", "admin"] as const;

const pollBodySchema = z.object({
  domainId: z.string().uuid("domainId deve ser um UUID válido."),
});

export const Route = createFileRoute("/api/saas/domains/poll")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
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

        const parsed = pollBodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "domainId inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }

        const db = await loadSgaAdminClient();
        const { data: domain, error: loadErr } = await db
          .from("tenant_domains")
          .select("id, hostname, status, tenant_id, check_count, tenants(slug)")
          .eq("id", parsed.data.domainId)
          .maybeSingle();

        if (loadErr || !domain) {
          return jsonWithCors(
            request,
            { error: "Domínio não encontrado." },
            { status: 404, apps: [...APPS] },
          );
        }

        const tenant = domain.tenants as { slug?: string } | null;
        const tenantSlug = tenant?.slug ?? "";
        const tenantId = String(domain.tenant_id);
        const hostname = String(domain.hostname);

        const state = {
          domainId: domain.id as string,
          hostname,
          tenantSlug,
          tenantId,
          status: (domain.status ?? "pending") as "pending" | "active" | "failed",
          lastCheckedAt: null,
          checkCount: (domain.check_count ?? 0) as number,
        };

        // Incrementar contador de tentativas
        await db
          .from("tenant_domains")
          .update({
            check_count: state.checkCount + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", domain.id);

        const result = await pollCustomDomainDns(state);

        // Persistir resultado se activo ou falhado
        if (result.status !== "pending") {
          await persistPollResult(domain.id as string, result);
        }

        const instructions = domainDnsInstructions(hostname, tenantSlug, tenantId);

        return jsonWithCors(
          request,
          {
            status: result.status,
            method: "method" in result ? result.method : undefined,
            reason: "reason" in result ? result.reason : undefined,
            checkedAt: result.checkedAt,
            instructions,
          },
          { apps: [...APPS] },
        );
      },
    },
  },
  component: DomainPollApiPlaceholder,
});

function DomainPollApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de Polling DNS</h1>
      <p className="mt-2 text-sm text-muted-foreground">POST com domainId. A UI vive no painel da escola.</p>
    </main>
  );
}
