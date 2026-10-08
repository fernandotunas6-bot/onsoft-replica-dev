import { createFileRoute } from "@tanstack/react-router";
import { showcaseHiddenInputSchema } from "@/features/saas/web-site-schemas";
import { listShowcaseAdmin, setShowcaseHidden } from "@/features/saas/web-site-content";
import { SITE_ADMIN_APPS, readBody, withSiteAdmin } from "@/features/saas/site-admin-route";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — vitrine de escolas no site: o ADMIN vê quem aceitou e pode esconder.

export const Route = createFileRoute("/api/saas/site/showcase")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...SITE_ADMIN_APPS]),
      GET: async ({ request }) =>
        withSiteAdmin(request, "Não foi possível ler as escolas.", async () => ({
          schools: await listShowcaseAdmin(),
        })),
      POST: async ({ request }) =>
        withSiteAdmin(request, "Não foi possível actualizar a escola.", async () => {
          const body = await readBody(request, showcaseHiddenInputSchema);
          await setShowcaseHidden(body.schoolId, body.hidden, body.reason);
          return { ok: true };
        }),
    },
  },
  component: SiteShowcaseApiPlaceholder,
});

function SiteShowcaseApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API da vitrine de escolas</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET/POST autenticado. A UI vive no ADMIN.
      </p>
    </main>
  );
}
