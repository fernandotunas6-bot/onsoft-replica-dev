import { loadSchoolSite, schoolSiteRequest } from "./school-sites";
import { loadSchoolPublication } from "./publication";
import { loadPublishedSchoolBlog } from "./blog-server";
import { renderSchoolWebsite } from "./render-site";
import { isPageInScope, narrowToScope, siteScope } from "./site-scope";

/** Runs before the SIGA router only for public school pages. No session-based fallback. */
export async function handleSchoolWebsite(request: Request): Promise<Response | null> {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const url = new URL(request.url);
  if (!schoolSiteRequest(url)) return null;
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (body: string, status = 200) =>
    new Response(request.method === "HEAD" ? null : body, { status, headers });
  try {
    const site = await loadSchoolSite(request);
    if (!site)
      return reply(
        '<!doctype html><html lang="pt"><title>Escola indisponível</title><main><h1>Esta página não está disponível.</h1><p>Confirme o endereço da instituição.</p></main></html>',
        404,
      );
    const page = site.page.endsWith("/") ? site.page : site.page + "/";
    if (page.startsWith("/portal/")) return Response.redirect(site.portalUrl, 302);
    if (page.startsWith("/noticias/"))
      return Response.redirect(site.origin + site.basePath + "/blog/", 302);
    // Âmbito: uma escola que ainda não publicou mostra só as páginas que
    // dependem da sua identidade. O catálogo do modelo — 18 cursos, notícias e
    // eventos inventados — não sai sob o nome dela. Ver `site-scope`.
    const scope = siteScope(site.state);
    if (scope && !isPageInScope(page, scope))
      return reply(
        '<!doctype html><html lang="pt"><title>Página não publicada</title><main><h1>Esta página ainda não foi publicada.</h1><p>A instituição ainda não publicou este conteúdo.</p></main></html>',
        404,
      );
    const [publication, recent] = await Promise.all([
      // Só o nome: `schools.email`/`phone` são contactos administrativos, não
      // publicados (`tests/school-website/school-sites.test.ts` fixa-o). Os
      // contactos públicos são os que a escola grava na campanha ou no editor.
      loadSchoolPublication(site.schoolId, site.state, {
        name: site.name,
        shortName: site.name,
        websiteUrl: site.origin + site.homePath,
      }),
      page === "/" ? loadPublishedSchoolBlog(site.schoolId) : Promise.resolve(null),
    ]);
    let blog;
    if (page.startsWith("/blog/")) {
      const slug =
        page.match(/^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/)?.[1] ||
        url.searchParams.get("artigo") ||
        undefined;
      if (page !== "/blog/" && !slug) return reply("<h1>Artigo não encontrado.</h1>", 404);
      const number = Number(url.searchParams.get("page") ?? 0);
      if (!Number.isInteger(number) || number < 0 || number > 1000)
        return reply("<h1>Página inválida.</h1>", 400);
      const result = await loadPublishedSchoolBlog(site.schoolId, slug ? 0 : number, slug);
      if (slug && !result.posts[0]) return reply("<h1>Artigo não encontrado.</h1>", 404);
      blog = { ...result, page: number, ...(slug ? { article: result.posts[0] } : {}) };
    }
    const html = renderSchoolWebsite(site, page, publication, blog, recent?.posts);
    if (!html) return reply("<h1>Página não encontrada.</h1>", 404);
    return reply(scope ? narrowToScope(html, scope) : html);
  } catch {
    return reply(
      '<!doctype html><html lang="pt"><title>Website temporariamente indisponível</title><main><h1>Não foi possível carregar esta página agora.</h1><p>Tente novamente dentro de instantes.</p></main></html>',
      503,
    );
  }
}
