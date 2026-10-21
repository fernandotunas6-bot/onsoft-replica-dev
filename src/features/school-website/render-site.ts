import pagesJson from "./site-pages.generated.json";
import { safePublicUrl } from "./content-model";
import { schoolBlogArticle, schoolBlogCards, escapeWebsiteText as esc } from "./blog-view";
import type { PublicSchoolBlogPost } from "./blog-model";
import type { SchoolSite } from "./school-sites";
import type { loadSchoolPublication } from "./publication";

const pages = pagesJson as Record<string, string>;
const ASSET_BASE = "/_school-website";
export function schoolWebsiteHref(
  value: string,
  site: Pick<SchoolSite, "basePath" | "homePath" | "portalUrl">,
) {
  if (!value.startsWith("/") || value.startsWith("//")) return value;
  if (value.startsWith(ASSET_BASE + "/") || value.startsWith(site.basePath + "/")) return value;
  if (value.startsWith("/assets/") || /^\/(?:style\.css|app\.js|[^/]+\.mjs)$/.test(value))
    return ASSET_BASE + value;
  const [pathname] = value.split(/[?#]/);
  if (pathname === "/") return site.homePath + value.slice(1);
  if (pathname === "/login/" || pathname.startsWith("/portal/")) return site.portalUrl;
  if (pathname.startsWith("/noticias/")) return site.basePath + "/blog/";
  if (pages[pathname] || pathname.startsWith("/blog/")) return site.basePath + value;
  return value;
}
export function applyWebsiteValues(html: string, values: Record<string, string>) {
  html = html.replace(/<!--site:([\w.-]+)-->([^<]*)<!--\/site-->/g, (whole, key) =>
    typeof values[key] === "string" ? `<!--site:${key}-->${esc(values[key])}<!--/site-->` : whole,
  );
  return html
    .replace(/<[a-z][^>]*data-site-fields="([^"]+)"[^>]*>/gi, (tag, fields: string) => {
      for (const pair of fields.split(" ")) {
        const [attr, key] = pair.split(":");
        let value = values[key];
        if (typeof value !== "string" || attr === "title") continue;
        if (attr === "src" && /^data\.courses\.\d+\.image$/.test(key))
          value = `/assets/${value}.webp`;
        if ((attr === "href" || attr === "src") && !safePublicUrl(value, attr === "src")) continue;
        tag = tag.replace(new RegExp(`\\s${attr}="[^"]*"`), () => ` ${attr}="${esc(value)}"`);
      }
      return tag;
    })
    .replace(
      /(<title[^>]*data-site-fields="title:([^"]+)"[^>]*>)[\s\S]*?(<\/title>)/,
      (whole, start, key, end) =>
        typeof values[key] === "string" ? start + esc(values[key]) + end : whole,
    );
}
export function renderSchoolWebsite(
  site: SchoolSite,
  page: string,
  publication: Awaited<ReturnType<typeof loadSchoolPublication>>,
  blog?: {
    posts: PublicSchoolBlogPost[];
    total: number;
    page: number;
    article?: PublicSchoolBlogPost;
  },
  recentPosts?: PublicSchoolBlogPost[],
) {
  const path = page.endsWith("/") ? page : page + "/";
  let html = pages[blog ? "/blog/" : path];
  if (!html) return null;
  const displayName = site.name.slice(0, 40);
  html = html.replaceAll("ISPAB", () => esc(displayName));
  html = applyWebsiteValues(html, publication.values);
  if (site.logoUrl?.startsWith("https://") && safePublicUrl(site.logoUrl, true))
    html = html.replace(
      /(<a\b[^>]*class="brand"[^>]*>)<svg[\s\S]*?<\/svg>/g,
      (_whole, start) => `${start}<img src="${esc(site.logoUrl)}" alt="">`,
    );
  if (path === "/" && recentPosts)
    html = html.replace(
      /<div class="article-grid"[^>]*>[\s\S]*?<\/div>/,
      () =>
        `<div class="article-grid">${schoolBlogCards(recentPosts.slice(0, 3), site.basePath)}</div>`,
    );
  if (blog) {
    if (blog.article) {
      const article = blog.article;
      const main = schoolBlogArticle(article, site.basePath);
      html = html.replace(
        /(<main\b[^>]*>)[\s\S]*?(<\/main>)/,
        (_whole, start, end) => start + main + end,
      );
      html = html
        .replace(
          /<title[^>]*>[\s\S]*?<\/title>/,
          () => `<title>${esc(article.title)} | ${esc(displayName)}</title>`,
        )
        .replace(
          /name="description" content="[^"]*"/,
          () => `name="description" content="${esc(article.excerpt)}"`,
        );
    } else {
      const listing = `<div class="article-grid">${schoolBlogCards(blog.posts, site.basePath)}</div><nav class="blog-pagination" aria-label="Páginas do blog">${blog.page > 0 ? `<a class="outline-button" href="${site.basePath}/blog/?page=${blog.page - 1}">Anterior</a>` : ""}${(blog.page + 1) * 12 < blog.total ? `<a class="outline-button" href="${site.basePath}/blog/?page=${blog.page + 1}">Seguinte</a>` : ""}</nav>`;
      html = html.replace(
        /(<section\b[^>]*\bdata-school-blog\b[^>]*>)[\s\S]*?(<\/section>)/,
        (_whole, start, end) => start + listing + end,
      );
    }
  }
  if (path === "/login/") {
    html = html.replace(
      /<div class="or">[\s\S]*?<\/div>\s*<a[^>]*class="outline-button demo-login"[^>]*>[\s\S]*?<\/a>/,
      "",
    );
    html = html.replace(
      /<div class="login-note">[\s\S]*?<\/div>/,
      '<div class="login-note"><p>Utilize as credenciais emitidas pela escola. A conta e a verificação de segurança são geridas pelo SIGA Plus.</p></div>',
    );
  }
  html = html.replace(
    /\b(href|src|action)="(\/[^"]*)"/g,
    (_whole, attr, raw) => `${attr}="${schoolWebsiteHref(raw, site)}"`,
  );
  const bootstrap = JSON.stringify({
    schoolName: site.name,
    storageId: site.publicCode,
    portalUrl: site.portalUrl,
    contentUrl: `${site.origin}/api/public/school-content/${encodeURIComponent(site.publicCode)}`,
    blogUrl: `${site.origin}/api/public/school-blog/${encodeURIComponent(site.publicCode)}`,
    assetBase: ASSET_BASE,
    basePath: site.basePath,
    homePath: site.homePath,
    routes: Object.keys(pages),
    serverBlog: Boolean(blog) || recentPosts !== undefined,
    content: publication,
  })
    .replace(/</g, "\\u003c")
    .replace(/&/g, "\\u0026");
  html = html.replace(
    "</head>",
    () =>
      `<meta name="school-site-base" content="${esc(site.basePath)}"><meta name="school-site-assets" content="${ASSET_BASE}"><meta name="school-site-home" content="${esc(site.homePath)}"><link rel="canonical" href="${esc(site.origin + (path === "/" ? site.homePath : site.basePath + path))}"><script type="application/json" id="school-site-bootstrap">${bootstrap}</script></head>`,
  );
  return html;
}
export const schoolWebsitePages = Object.keys(pages);
