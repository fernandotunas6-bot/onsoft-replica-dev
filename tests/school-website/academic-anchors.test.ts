/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import pages from "@/features/school-website/site-pages.generated.json";
// @ts-expect-error Public site build helpers are native JavaScript.
import { prepareAcademicSectionAnchors } from "../../painel/escolas/scripts/academic-page-layout.mjs";
// @ts-expect-error Public site enhancement uses native browser modules.
import { setupAcademicPages } from "../../painel/escolas/src/academic-pages.mjs";
afterEach(() => {
  document.body.innerHTML = "";
});
describe("ligações directas para secções académicas", () => {
  it("publica os destinos antes de carregar conteúdo e conserva-os ao desmontar o realce", () => {
    const html = pages["/ingresso/"];
    document.body.innerHTML = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);
    const targets = [...document.querySelectorAll(".academic-section-target")];
    expect(targets).toHaveLength(2);
    expect(targets.map((n) => n.id)).toEqual(["academic-section-1", "academic-section-2"]);
    const controller = setupAcademicPages();
    expect(
      [...document.querySelectorAll(".academic-section-nav a")].map((n) => n.getAttribute("href")),
    ).toEqual(targets.map((n) => "#" + n.id));
    controller.destroy();
    expect([...document.querySelectorAll(".academic-section-target")]).toEqual(targets);
  });
  it("conserva IDs existentes, evita colisões e não trata secções aninhadas como destinos principais", () => {
    const html =
      '<div id="academic-section-1"></div><section class="page-head"><h1>Página</h1></section><section><h2>Primeira</h2><section><h2>Detalhe</h2></section></section><section id="publicado"><h2>Segunda</h2></section><section class="cta"><h2>Continuar</h2></section>';
    const once = prepareAcademicSectionAnchors(html);
    expect(prepareAcademicSectionAnchors(once)).toBe(once);
    document.body.innerHTML = once;
    expect([...document.querySelectorAll(".academic-section-target")].map((n) => n.id)).toEqual([
      "academic-section-1-1",
      "publicado",
    ]);
    expect(document.querySelectorAll(".cta.academic-section-target")).toHaveLength(0);
  });
  it("mantém intactas as páginas cuja navegação usa recursos externos", () => {
    const html =
      '<section><h2>Biblioteca</h2><a class="resource-card" href="https://example.test/">Catálogo</a></section><section><h2>Fontes</h2><a class="resource-card" href="/fontes/">Fontes</a></section>';
    expect(prepareAcademicSectionAnchors(html)).toBe(html);
  });
});
