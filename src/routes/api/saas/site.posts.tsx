import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { blogPostInputSchema } from "@/features/saas/web-site-schemas";
import { deletePost, listAllPosts, savePost } from "@/features/saas/web-site-content";
import { SITE_ADMIN_APPS, readBody, withSiteAdmin } from "@/features/saas/site-admin-route";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — artigos do blog do site, geridos no ADMIN.

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), post: blogPostInputSchema }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

export const Route = createFileRoute("/api/saas/site/posts")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...SITE_ADMIN_APPS]),
      GET: async ({ request }) =>
        withSiteAdmin(request, "Não foi possível ler os artigos.", async () => ({
          posts: await listAllPosts(),
        })),
      POST: async ({ request }) =>
        withSiteAdmin(request, "Não foi possível guardar o artigo.", async (actor) => {
          const body = await readBody(request, actionSchema);
          if (body.action === "delete") {
            await deletePost(body.id);
            return { ok: true };
          }
          return savePost(body.post, actor);
        }),
    },
  },
  component: SitePostsApiPlaceholder,
});

function SitePostsApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API dos artigos</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET/POST autenticado. A UI vive no ADMIN.
      </p>
    </main>
  );
}
