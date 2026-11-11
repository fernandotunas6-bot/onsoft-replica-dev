import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Marca do ecossistema. O SIGA documenta-a em src/components/ui/siga-logo.tsx:
 * letreiro «SIGA Plus» e o ícone «S» em squircle de public/icons/. Até 10/11/2026,
 * WEB, ADMIN e DOC mostravam o carrinho de compras do modelo ShadcnStore como
 * logótipo e favicon. Cada app guarda a sua cópia do ficheiro (sem partilhar
 * componentes entre apps), mas é o mesmo ícone.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path));
const text = (path: string) => read(path).toString("utf8");
/** Primeiro traço do SVG do carrinho do modelo. */
const TEMPLATE_CART_PATH = "M26 24.75C26.4142";

describe("marca SIGA Plus em WEB, ADMIN e DOC", () => {
  const official = read("public/icons/icon-192.png");

  for (const app of ["painel/web", "painel/admin", "painel/docs"]) {
    it(`${app}: public/brand/siga-plus-icon.png é o ícone oficial do SIGA`, () => {
      expect(read(`${app}/public/brand/siga-plus-icon.png`).equals(official)).toBe(true);
    });
  }

  for (const file of [
    "painel/web/src/components/logo.tsx",
    "painel/admin/src/components/logo.tsx",
  ]) {
    it(`${file} usa o ícone oficial, não o carrinho do modelo`, () => {
      const source = text(file);
      expect(source).toContain("brand/siga-plus-icon.png");
      expect(source).not.toContain(TEMPLATE_CART_PATH);
    });
  }

  it("DOC: logótipo e ícone de ecrã inicial apontam para a marca oficial", () => {
    const config = text("painel/docs/.vitepress/config.ts");
    expect(config).toContain("logo: { src: '/brand/siga-plus-icon.png'");
    expect(config).not.toContain("/logo.svg");
  });

  it("imagem de partilha: o mesmo ficheiro 1200×630 no SIGA, no WEB e no DOC", () => {
    const image = read("public/og-image.png");
    // Cabeçalho PNG: largura e altura nos bytes 16–23 (IHDR).
    expect(image.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([1200, 630]);
    for (const app of ["painel/web", "painel/docs"]) {
      expect(read(`${app}/public/og-image.png`).equals(image), app).toBe(true);
    }
  });

  it("imagem de partilha declarada com endereço absoluto em cada app", () => {
    expect(text("src/routes/__root.tsx")).toContain(
      'property: "og:image", content: `${getAppUrl()}/og-image.png`',
    );
    expect(text("painel/web/vite.config.ts")).toContain(
      'meta({ property: "og:image", content: `${origin}/og-image.png` })',
    );
    expect(text("painel/docs/.vitepress/config.ts")).toContain(
      "['meta', { property: 'og:image', content: `${DOCS_URL}/og-image.png` }]",
    );
  });

  it("WEB: favicon com caminho absoluto (o relativo falhava em /blog/<artigo>)", () => {
    const html = text("painel/web/index.html");
    expect(html).toContain('<link rel="icon" href="/favicon.png" type="image/png">');
    expect(html).not.toMatch(/href="favicon/);
  });
});
