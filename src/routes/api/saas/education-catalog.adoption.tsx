import { createFileRoute } from "@tanstack/react-router";
import { fetchCatalogAdoption } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — adopção do catálogo por escola, para o ADMIN.

export const Route = createFileRoute("/api/saas/education-catalog/adoption")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const adoption = await fetchCatalogAdoption();
          return jsonWithCors(request, { adoption }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível carregar a adopção.";
          const status =
            message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: AdoptionApiPlaceholder,
});

function AdoptionApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">Adopção do catálogo</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET autenticado para o ADMIN.</p>
    </main>
  );
}
