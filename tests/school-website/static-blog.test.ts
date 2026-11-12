/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The static website intentionally uses plain JavaScript modules.
import * as blogRuntime from "../../painel/escolas/src/school-blog.mjs";

// Em cache fria a avaliação dos módulos e a primeira renderização consomem o
// orçamento de 5s por omissão, e o custo cai em quem correr primeiro. Mesmo
// limite já usado nos ficheiros de tests/routes.
vi.setConfig({ testTimeout: 20_000 });
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});
describe("blog em hospedagem estática", () => {
  it("a página inicial recebe as publicações sem criar outra grelha dentro da existente", async () => {
    document.body.innerHTML = '<div class="article-grid" data-school-blog-feed></div>';
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          posts: [
            {
              slug: "noticia",
              title: "Artigo publicado",
              excerpt: "Resumo",
              category: "Novidades",
            },
          ],
          total: 1,
        }),
      ),
    );
    await blogRuntime.setupSchoolBlog(
      { blogUrl: "https://siga.example/api/public/school-blog/CODE" },
      { esc },
    );
    expect(document.querySelectorAll(".article-grid")).toHaveLength(1);
    expect(document.querySelector("h3")?.textContent).toBe("Artigo publicado");
  });
  it("o corpo de um artigo remoto é apresentado como texto literal", async () => {
    history.replaceState(null, "", "/blog/?artigo=noticia");
    document.body.innerHTML = "<section data-school-blog></section>";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          post: {
            title: "Artigo",
            body: "<script>alert(1)</script>",
            category: "Novidades",
            excerpt: "Resumo",
          },
        }),
      ),
    );
    await blogRuntime.setupSchoolBlog(
      { blogUrl: "https://siga.example/api/public/school-blog/CODE" },
      { esc },
    );
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("[data-school-blog]")?.textContent).toContain(
      "<script>alert(1)</script>",
    );
  });
});
