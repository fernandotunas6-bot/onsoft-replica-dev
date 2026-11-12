import { describe, expect, it } from "vitest";
import {
  copyPageAppearance,
  editableWebsitePages,
} from "@/features/school-website/page-appearance";
import { parseWebsiteDesign } from "../../painel/escolas/src/design.mjs";
import { websiteTemplate } from "@/features/school-website/content-model";
const fixture = () =>
  parseWebsiteDesign({
    activeTheme: "editorial",
    overrides: { buttonShape: "rounded" },
    pages: {
      "/ingresso/": { buttonShape: "pill", motion: "fade" },
      "/cursos/": { buttonShape: "square", fontBody: "editorial" },
      "/sobre/": { footerLayout: "center" },
    },
  });
describe("reutilização dos estilos de páginas", () => {
  it("junta os ajustes da origem, substitui opções em comum e preserva as restantes páginas", () => {
    const input = fixture(),
      original = JSON.stringify(input),
      next = copyPageAppearance(input, "/ingresso/", "/cursos/", "merge");
    expect(next.pages["/cursos/"]).toEqual({
      buttonShape: "pill",
      fontBody: "editorial",
      motion: "fade",
    });
    expect(next.pages["/ingresso/"]).toEqual(input.pages["/ingresso/"]);
    expect(next.pages["/sobre/"]).toEqual(input.pages["/sobre/"]);
    expect(next.overrides).toEqual(input.overrides);
    expect(next.activeTheme).toBe(input.activeTheme);
    expect(JSON.stringify(input)).toBe(original);
  });
  it("substitui apenas as personalizações do destino e pode criar ajustes numa página sem personalização", () => {
    const input = fixture();
    expect(
      copyPageAppearance(input, "/ingresso/", "/cursos/", "replace").pages["/cursos/"],
    ).toEqual(input.pages["/ingresso/"]);
    expect(copyPageAppearance(input, "/ingresso/", "/", "merge").pages["/"]).toEqual(
      input.pages["/ingresso/"],
    );
  });
  it("recusa páginas não editáveis, a própria página e origens sem personalizações", () => {
    const input = fixture();
    for (const path of ["/portal/", "/404/", "/inexistente/", ""])
      expect(() => copyPageAppearance(input, "/ingresso/", path, "merge")).toThrow(
        /páginas públicas/,
      );
    expect(() => copyPageAppearance(input, "/ingresso/", "/ingresso/", "merge")).toThrow(
      /diferente/,
    );
    expect(() => copyPageAppearance(input, "/", "/cursos/", "merge")).toThrow(/ainda não/);
  });
  it("impede uma combinação de cores com contraste inválido sem modificar o original", () => {
    const input = parseWebsiteDesign({
      activeTheme: "campus",
      pages: {
        "/ingresso/": { primary: "#000000" },
        "/cursos/": { primary: "#ffffff", secondary: "#ffffff", onPrimary: "#000000" },
      },
    });
    const original = JSON.stringify(input);
    expect(() => copyPageAppearance(input, "/ingresso/", "/cursos/", "merge")).toThrow(/contraste/);
    expect(JSON.stringify(input)).toBe(original);
  });
  it("os atalhos de todas as páginas públicas encontram um grupo de conteúdos existente", () => {
    const groups = new Set(websiteTemplate.fields.map((field) => field.group));
    for (const page of editableWebsitePages)
      expect(groups.has(`${page.title} · ${page.url}`), page.url).toBe(true);
  });
});
