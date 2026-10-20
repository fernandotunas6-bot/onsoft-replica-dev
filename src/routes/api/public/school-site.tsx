// style-check: route-exempt — API pública do website institucional da escola.
import { createFileRoute } from "@tanstack/react-router";
import { loadPublishedSchoolSite } from "@/features/school-site/public-server";

export const Route = createFileRoute("/api/public/school-site")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = new Headers({
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
          "Vary": "Host",
        });
        try {
          const hostname = new URL(request.url).hostname;
          const site = await loadPublishedSchoolSite(hostname);
          return new Response(
            JSON.stringify(site ? { site } : { error: "site_unavailable" }),
            { status: site ? 200 : 404, headers },
          );
        } catch {
          return new Response(JSON.stringify({ error: "site_unavailable" }), {
            status: 503,
            headers,
          });
        }
      },
    },
  },
});
