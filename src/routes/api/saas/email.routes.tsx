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
import { requireTenantAccess, resolveBearerUserId } from "@/features/saas/platform-guard";

// style-check: route-exempt — gestão de rotas de e-mail institucional.

const APPS = ["web", "admin"] as const;

// Reencaminhar o e-mail institucional de uma escola desvia recuperações de
// palavra-passe e correspondência oficial. Sem guarda, um `tenantId` no corpo do
// pedido bastava para o fazer a qualquer escola: `requireTenantAccess` exige
// sessão e confirma que ela manda mesmo nesse tenant (Administrador da escola ou
// administrador da plataforma).
async function authorizeTenant(request: Request, tenantId: string) {
  const userId = await resolveBearerUserId(request.headers.get("Authorization"));
  return requireTenantAccess(userId, tenantId);
}

function authErrorStatus(message: string): number {
  if (message === "Unauthorized" || message.includes("Sem permissão")) return 401;
  if (message.includes("não encontrada")) return 404;
  return 500;
}

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
          return jsonWithCors(
            request,
            { error: "Corpo JSON inválido." },
            { status: 400, apps: [...APPS] },
          );
        }

        const parsed = createRouteBodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }

        let tenant: { tenantSlug: string };
        try {
          tenant = await authorizeTenant(request, parsed.data.tenantId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Sem permissão para gerir esta escola.";
          return jsonWithCors(
            request,
            { error: message },
            { status: authErrorStatus(message), apps: [...APPS] },
          );
        }

        const institutionalAddress = buildInstitutionalAddress(
          tenant.tenantSlug,
          getPlatformDomain(),
        );

        const result = await createEmailRoute({
          institutionalAddress,
          forwardTo: parsed.data.forwardTo,
          tenantSlug: tenant.tenantSlug,
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
          return jsonWithCors(
            request,
            { error: "Corpo JSON inválido." },
            { status: 400, apps: [...APPS] },
          );
        }

        const parsed = deleteRouteBodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }

        try {
          await authorizeTenant(request, parsed.data.tenantId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Sem permissão para gerir esta escola.";
          return jsonWithCors(
            request,
            { error: message },
            { status: authErrorStatus(message), apps: [...APPS] },
          );
        }

        const creds = resolveCloudflareCredentials();
        if (creds) {
          await deleteEmailRoute(parsed.data.routeId, creds.zoneId, creds.apiToken);
        }

        // Desactivar na BD. A coluna de estado é `status` (não `active`) e a tabela é
        // indexada por `school_id` — `tenant_id` não existe aqui, é da escola que se
        // chega ao tenant.
        const db = await loadSgaAdminClient();
        const { data: school } = await db
          .from("schools")
          .select("id")
          .eq("tenant_id", parsed.data.tenantId)
          .maybeSingle();

        if (school?.id) {
          await db
            .from("school_email_routes")
            .update({ status: "suspended", updated_at: new Date().toISOString() })
            .eq("cloudflare_route_id", parsed.data.routeId)
            .eq("school_id", school.id as string);
        }

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
      <p className="mt-2 text-sm text-muted-foreground">
        POST para criar, DELETE para remover. A UI vive no painel da escola.
      </p>
    </main>
  );
}
