import { createFileRoute } from "@tanstack/react-router";
import { tenantSlugInputSchema } from "@/features/saas/schemas";
import { fetchTenantBySlug, publicTenantSummary } from "@/features/saas/tenant-lookup";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["web", "admin"] as const;

// style-check: route-exempt — lookup público de tenant por slug (branding / E2E).

export const Route = createFileRoute("/api/saas/tenants/lookup")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = tenantSlugInputSchema.safeParse({
          slug: url.searchParams.get("slug") ?? "",
        });
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Indique ?slug= válido." },
            { status: 400, apps: [...APPS] },
          );
        }
        try {
          const tenant = await fetchTenantBySlug(parsed.data.slug);
          if (!tenant) {
            return jsonWithCors(request, { tenant: null }, { status: 404, apps: [...APPS] });
          }
          return jsonWithCors(
            request,
            { tenant: publicTenantSummary(tenant) },
            { apps: [...APPS] },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível resolver a escola.";
          return jsonWithCors(request, { error: message }, { status: 500, apps: [...APPS] });
        }
      },
    },
  },
  component: TenantLookupApiPlaceholder,
});

function TenantLookupApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API lookup tenant</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET ?slug= para branding e verificação E2E.
      </p>
    </main>
  );
}
