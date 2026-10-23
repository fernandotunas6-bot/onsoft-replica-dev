import { createFileRoute } from "@tanstack/react-router";
import {
  fetchPublicStats,
  listPublishedFaqs,
  listPublishedPosts,
  listShowcaseSchools,
} from "@/features/saas/web-site-content";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["web"] as const;

// style-check: route-exempt — conteúdo público do site (painel/web), só o publicado.

const settled = <T,>(result: PromiseSettledResult<T>, fallback: T) =>
  result.status === "fulfilled" ? result.value : fallback;

export const Route = createFileRoute("/api/saas/public/site")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      // Cada parte falha sozinha: o site mostra o que vier e usa o texto fixo no resto.
      GET: async ({ request }) => {
        const [faqs, showcase, stats, posts] = await Promise.allSettled([
          listPublishedFaqs(),
          listShowcaseSchools(),
          fetchPublicStats(),
          listPublishedPosts(3),
        ]);
        return jsonWithCors(
          request,
          {
            faqs: settled(faqs, null),
            showcase: settled(showcase, null),
            stats: settled(stats, null),
            posts: settled(posts, null),
          },
          { apps: [...APPS] },
        );
      },
    },
  },
  component: PublicSiteApiPlaceholder,
});

function PublicSiteApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API do site</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET devolve perguntas, escolas, números e artigos publicados.
      </p>
    </main>
  );
}
