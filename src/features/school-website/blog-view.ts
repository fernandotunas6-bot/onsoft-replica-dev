import type { PublicSchoolBlogPost } from "./blog-model";
export const escapeWebsiteText = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function schoolBlogCards(posts: PublicSchoolBlogPost[], basePath: string) {
  const esc = escapeWebsiteText;
  return posts.length
    ? posts
        .map(
          (post) =>
            `<article class="article-card"><a href="${esc(basePath)}/blog/${esc(post.slug)}/">${post.coverUrl ? `<img src="${esc(post.coverUrl)}" alt="${esc(post.coverAlt)}" loading="lazy">` : ""}<span class="eyebrow">${esc(post.category)}</span><h3>${esc(post.title)}</h3></a><p>${esc(post.excerpt)}</p><a class="text-link" href="${esc(basePath)}/blog/${esc(post.slug)}/">Ler artigo <span aria-hidden="true">↗</span></a></article>`,
        )
        .join("")
    : '<p class="quiet-note">Ainda não há publicações disponíveis. Volte em breve para conhecer as novidades da instituição.</p>';
}
export function schoolBlogArticle(post: PublicSchoolBlogPost, basePath: string) {
  const esc = escapeWebsiteText;
  return `<div class="breadcrumb wrap"><a href="${esc(basePath)}/blog/">Blog da escola</a><span>/</span><span>${esc(post.category)}</span></div><section class="page-head wrap"><span class="eyebrow">${esc(post.category)}</span><h1>${esc(post.title)}</h1><p>${esc(post.excerpt)}</p><p class="quiet-note">${post.authorName ? esc(post.authorName) + " · " : ""}<time datetime="${esc(post.publishedAt)}">${esc(new Date(post.publishedAt).toLocaleDateString("pt-AO", { timeZone: "Africa/Luanda" }))}</time></p></section><article class="prose wrap section">${post.coverUrl ? `<img class="school-blog-cover" src="${esc(post.coverUrl)}" alt="${esc(post.coverAlt)}">` : ""}${post.body
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((paragraph) => `<p>${esc(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join(
      "",
    )}</article><div class="wrap section"><a class="outline-button" href="${esc(basePath)}/blog/">Voltar ao blog</a></div>`;
}
