import { createFileRoute } from "@tanstack/react-router";
import {
  registerTenantDomainInputSchema,
  updateTenantDomainStatusInputSchema,
} from "@/features/saas/schemas";
import {
  fetchAllTenantDomains,
  registerTenantDomain,
  updateTenantDomainStatus,
} from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors, readJsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — domínios SaaS para o ADMIN.

export const Route = createFileRoute("/api/saas/domains")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const domains = await fetchAllTenantDomains();
          return jsonWithCors(request, { domains }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível listar domínios.";
          const status =
            message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
      POST: async ({ request }) => {
        const read = await readJsonWithCors(request, [...APPS]);
        if (!read.ok) return read.response;
        const body = read.value;
        const parsed = registerTenantDomainInputSchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }
        try {
          const actorUserId = await requirePlatformAdminFromRequest(request);
          const result = await registerTenantDomain({ ...parsed.data, actorUserId });
          return jsonWithCors(request, result, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível registar domínio.";
          const status =
            message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 400;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: DomainsApiPlaceholder,
});

function DomainsApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de domínios SaaS</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET/POST autenticado. A UI vive no ADMIN.
      </p>
    </main>
  );
}
