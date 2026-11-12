import { describe, expect, it } from "vitest";
import {
  changeSchoolBlogSchema,
  changeSchoolBlogState,
  publicSchoolBlogPost,
} from "@/features/school-website/blog-model";
import { createSchoolBlogHandler } from "@/features/school-website/blog-http";
import { schoolBlogArticle } from "@/features/school-website/blog-view";
const draft = {
  title: "Notícia da escola",
  excerpt: "Uma actividade da comunidade.",
  body: "Primeiro parágrafo.\n\nSegundo parágrafo.",
  category: "Comunidade",
  coverUrl: "",
  coverAlt: "",
  authorName: "Direcção",
};
const publish = () =>
  changeSchoolBlogState(null, {
    slug: "noticia-escola",
    action: "publish",
    expectedRevision: 0,
    draft,
  });
describe("publicação do blog escolar", () => {
  it("guardar um rascunho não publica nem altera o texto já publicado", () => {
    const fresh = changeSchoolBlogState(null, {
      slug: "noticia-escola",
      action: "save",
      expectedRevision: 0,
      draft,
    });
    expect(publicSchoolBlogPost(fresh)).toBeNull();
    const edited = changeSchoolBlogState(publish(), {
      slug: "noticia-escola",
      action: "save",
      expectedRevision: 1,
      draft: { ...draft, body: "Rascunho reservado" },
    });
    expect(publicSchoolBlogPost(edited)?.body).toBe(draft.body);
    expect(JSON.stringify(publicSchoolBlogPost(edited))).not.toContain("reservado");
  });
  it("conflitos e endereços duplicados nunca sobrepõem um artigo", () => {
    expect(() =>
      changeSchoolBlogState(publish(), {
        slug: "noticia-escola",
        action: "save",
        expectedRevision: 0,
        draft,
      }),
    ).toThrow(/alterado/);
    expect(() =>
      changeSchoolBlogState(publish(), {
        slug: "outra-noticia",
        action: "save",
        expectedRevision: 1,
        draft,
      }),
    ).toThrow(/alterado/);
  });
  it("arquivar e restaurar mantém o rascunho, sem republicar", () => {
    const archived = changeSchoolBlogState(publish(), {
      slug: "noticia-escola",
      action: "archive",
      expectedRevision: 1,
    });
    expect(publicSchoolBlogPost(archived)).toBeNull();
    expect(archived.draft).toEqual(draft);
    const restored = changeSchoolBlogState(archived, {
      slug: "noticia-escola",
      action: "restore",
      expectedRevision: 2,
    });
    expect(restored.archived).toBe(false);
    expect(publicSchoolBlogPost(restored)).toBeNull();
  });
  it("exige texto e resumo para publicar, recusa âmbito e imagens inseguras", () => {
    expect(() =>
      changeSchoolBlogState(null, {
        slug: "noticia",
        action: "publish",
        expectedRevision: 0,
        draft: { ...draft, excerpt: "" },
      }),
    ).toThrow(/resumo/);
    expect(() =>
      changeSchoolBlogSchema.parse({
        slug: "noticia",
        action: "save",
        expectedRevision: 0,
        draft,
        school_id: "escola-b",
      }),
    ).toThrow();
    expect(() =>
      changeSchoolBlogSchema.parse({
        slug: "../admin",
        action: "save",
        expectedRevision: 0,
        draft,
      }),
    ).toThrow();
    expect(() =>
      changeSchoolBlogSchema.parse({
        slug: "noticia",
        action: "save",
        expectedRevision: 0,
        draft: { ...draft, coverUrl: "javascript:alert(1)" },
      }),
    ).toThrow();
  });
  it("texto publicado é literal e não se transforma em código HTML", () => {
    const post = publicSchoolBlogPost(
      changeSchoolBlogState(null, {
        slug: "noticia",
        action: "publish",
        expectedRevision: 0,
        draft: { ...draft, body: "<script>alert(1)</script>\n\nTexto $&" },
      }),
    )!;
    const html = schoolBlogArticle(post, "/site");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Texto $&amp;");
  });
});
describe("API pública do blog", () => {
  const request = (code: string, origin = "https://a.example", query = "") =>
    new Request(`https://siga.example/api/public/school-blog/${code}${query}`, {
      headers: { Origin: origin },
    });
  const handler = createSchoolBlogHandler({
    resolve: async (code) =>
      code === "A"
        ? { schoolId: "school-a", origins: ["https://a.example"] }
        : code === "B"
          ? { schoolId: "school-b", origins: ["https://b.example"] }
          : null,
    posts: async (id) => ({
      posts: [{ ...publicSchoolBlogPost(publish())!, title: id }],
      total: 1,
    }),
  });
  it("o código da escola e a origem determinam apenas as suas publicações", async () => {
    const a = await handler(request("AA"), "A");
    // Public codes have at least two characters, like the existing school API.
    expect(a.status).toBe(400);
    const scoped = createSchoolBlogHandler({
      resolve: async (code) => ({
        schoolId: code,
        origins: [`https://${code.toLowerCase()}.example`],
      }),
      posts: async (schoolId) => ({
        posts: [{ ...publicSchoolBlogPost(publish())!, title: schoolId }],
        total: 1,
      }),
    });
    const result = await scoped(request("AA", "https://aa.example"), "AA");
    expect((await result.json()).posts[0].title).toBe("AA");
    expect((await scoped(request("BB", "https://aa.example"), "BB")).status).toBe(403);
  });
  it("listas não incluem o corpo; o artigo individual só contém a publicação", async () => {
    const scoped = createSchoolBlogHandler({
      resolve: async () => ({ schoolId: "school-a", origins: ["https://a.example"] }),
      posts: async () => ({ posts: [publicSchoolBlogPost(publish())!], total: 1 }),
    });
    const list = await scoped(request("AA"), "AA");
    const listing = await list.json();
    expect(listing.posts[0].body).toBeUndefined();
    expect(list.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    const single = await scoped(request("AA", "https://a.example", "?slug=noticia-escola"), "AA");
    expect((await single.json()).post.body).toBe(draft.body);
  });
  it("inexistência e falhas não expõem rascunhos nem detalhes internos", async () => {
    expect((await handler(request("missing"), "missing")).status).toBe(404);
    const failing = createSchoolBlogHandler({
      resolve: async () => {
        throw Error("private token");
      },
      posts: async () => ({ posts: [], total: 0 }),
    });
    const result = await failing(request("AA"), "AA");
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private");
  });
});
