import { createFileRoute } from "@tanstack/react-router";
import { catalogSearch } from "@/features/education-catalog/api";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["web", "admin"] as const;

// style-check: route-exempt — pesquisa pública do catálogo educacional (dados de referência).

export const Route = createFileRoute("/api/saas/education-catalog/search")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      // Só dados de referência, calculados em memória: sem sessão, como
      // /api/saas/education-catalog. Ver education-catalog/api.ts.
      GET: async ({ request }) => {
        const result = catalogSearch(new URL(request.url).searchParams);
        return jsonWithCors(request, result.body, { status: result.status, apps: [...APPS] });
      },
    },
  },
  component: EducationCatalogSearchPlaceholder,
});

function EducationCatalogSearchPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">Pesquisa do catálogo educacional</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET ?type=subjects&stage=AO-ESG2&q=mat · type=courses · type=stages&country=AO
      </p>
    </main>
  );
}
