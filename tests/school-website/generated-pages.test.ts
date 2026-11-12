import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Páginas do website escolar que o SIGA serve (`site-pages.generated.json`, gerado por
 * scripts/siga/build-school-website.mjs a partir de painel/escolas).
 *
 * - A 10/11/2026 o ficheiro versionado estava atrasado em relação a
 *   painel/escolas/docs/routes.json (faltavam /propinas/) e um teste falhava sem build.
 * - O modelo foi escrito numa hospedagem com login ChatGPT. Até 11/11/2026, o
 *   «Terminar sessão» das 9 páginas do portal de demonstração ia para
 *   /signout-with-chatgpt (404 no SIGA) e a privacidade dizia que «o login com ChatGPT
 *   é tratado pela hospedagem Sites».
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const pages = JSON.parse(read("src/features/school-website/site-pages.generated.json")) as Record<
  string,
  string
>;
const routes = JSON.parse(read("painel/escolas/docs/routes.json")) as Array<{ url: string }>;

describe("website escolar — páginas geradas", () => {
  it("cobre exactamente as rotas do modelo (sem /404/)", () => {
    const expected = routes.map((route) => route.url).filter((url) => url !== "/404/");
    expect(Object.keys(pages).sort()).toEqual(expected.sort());
  });

  it("sem restos da hospedagem de autoria", () => {
    const leftovers = Object.entries(pages)
      .filter(([, html]) => /chatgpt|hospedagem Sites/i.test(html))
      .map(([url]) => url);
    expect(leftovers).toEqual([]);
  });

  it("«Terminar sessão» do portal de demonstração leva à página de acesso da escola", () => {
    const portal = Object.entries(pages).filter(([url]) => url.startsWith("/portal/"));
    expect(portal.length).toBeGreaterThan(0);
    for (const [url, html] of portal) {
      expect(html, url).toMatch(/<a href="\/login\/">(?:(?!<\/a>)[\s\S])*Terminar sessão<\/a>/);
    }
  });

  it("a privacidade só afirma que não pede senhas porque nenhuma página tem esse campo", () => {
    expect(pages["/privacidade/"]).toContain("este website não pede nem guarda palavras-passe");
    for (const [url, html] of Object.entries(pages)) {
      expect(html, url).not.toMatch(/type=["']password/);
    }
  });
});
