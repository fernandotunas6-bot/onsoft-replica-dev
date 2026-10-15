import { createFileRoute } from "@tanstack/react-router";
import { buildCatalogOverview } from "@/features/education-catalog/overview";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["web", "admin"] as const;

// style-check: route-exempt — resumo público do catálogo educacional (dados de referência).

export const Route = createFileRoute("/api/saas/education-catalog")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      // Só dados de referência (ISCED, etapas por país, fontes): nada de escolas
      // nem de pessoas, por isso sem sessão — como /api/saas/plans.
      GET: async ({ request }) =>
        jsonWithCors(request, buildCatalogOverview(), { apps: [...APPS] }),
    },
  },
  component: EducationCatalogApiPlaceholder,
});

function EducationCatalogApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API do catálogo educacional</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET devolve totais, cobertura por país, etapas e fontes.
      </p>
    </main>
  );
}
