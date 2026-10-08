import { createFileRoute } from "@tanstack/react-router";
import { getPublishedPost, listPublishedPosts } from "@/features/saas/web-site-content";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["web"] as const;

// style-check: route-exempt — artigos publicados do blog do site (painel/web).

export const Route = createFileRoute("/api/saas/public/blog")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          const slug = new URL(request.url).searchParams.get("slug")?.trim();
          if (slug) {
            const post = await getPublishedPost(slug.slice(0, 120));
            return post
              ? jsonWithCors(request, { post }, { apps: [...APPS] })
              : jsonWithCors(
                  request,
                  { error: "Artigo não encontrado." },
                  { status: 404, apps: [...APPS] },
                );
          }
          return jsonWithCors(request, { posts: await listPublishedPosts() }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível ler os artigos.";
          return jsonWithCors(request, { error: message }, { status: 500, apps: [...APPS] });
        }
      },
    },
  },
  component: PublicBlogApiPlaceholder,
});

function PublicBlogApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API do blog</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET devolve os artigos publicados.</p>
    </main>
  );
}
