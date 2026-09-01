import { createFileRoute } from "@tanstack/react-router";
import { tenantSlugInputSchema } from "@/features/saas/schemas";
import { checkSlugAvailability } from "@/features/saas/tenant-lookup";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["web", "admin"] as const;

// style-check: route-exempt — verificação pública de disponibilidade de subdomínio.

export const Route = createFileRoute("/api/saas/domains/check")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawSlug = url.searchParams.get("slug") ?? "";
        const parsed = tenantSlugInputSchema.safeParse({ slug: rawSlug });

        if (!parsed.success) {
          return jsonWithCors(
            request,
            {
              slug: rawSlug,
              available: false,
              reason: "invalid",
              message: "Indique um subdomínio com pelo menos 3 caracteres alfanuméricos.",
            },
            { status: 400, apps: [...APPS] },
          );
        }

        try {
          const result = await checkSlugAvailability(parsed.data.slug);
          return jsonWithCors(request, result, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Erro ao verificar disponibilidade.";
          return jsonWithCors(
            request,
            { slug: parsed.data.slug, available: false, error: message },
            { status: 500, apps: [...APPS] },
          );
        }
      },
    },
  },
  component: DomainsCheckApiPlaceholder,
});

function DomainsCheckApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API verificação de slug</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET ?slug= para onboarding e wizard.</p>
    </main>
  );
}
