import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_STATUSES, contactStatusInputSchema } from "@/features/saas/web-site-schemas";
import { listContactMessages, setContactStatus } from "@/features/saas/web-site-content";
import { SITE_ADMIN_APPS, readBody, withSiteAdmin } from "@/features/saas/site-admin-route";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — mensagens do formulário de contacto do site, para o ADMIN.

export const Route = createFileRoute("/api/saas/site/messages")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...SITE_ADMIN_APPS]),
      GET: async ({ request }) =>
        withSiteAdmin(request, "Não foi possível ler as mensagens.", async () => {
          const status = new URL(request.url).searchParams.get("status");
          const filter = CONTACT_STATUSES.find((s) => s === status);
          return { messages: await listContactMessages(filter) };
        }),
      POST: async ({ request }) =>
        withSiteAdmin(request, "Não foi possível actualizar a mensagem.", async (actor) => {
          const body = await readBody(request, contactStatusInputSchema);
          await setContactStatus(body.id, body.status, actor);
          return { ok: true };
        }),
    },
  },
  component: SiteMessagesApiPlaceholder,
});

function SiteMessagesApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API das mensagens de contacto</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET/POST autenticado. A UI vive no ADMIN.
      </p>
    </main>
  );
}
