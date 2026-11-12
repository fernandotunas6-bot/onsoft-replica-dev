import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contrato de posicionamento. O CSS real é verificado no Playwright autenticado
 * (responsive-auth.spec.ts) quando há um formulário com SaveBar.
 */
describe("acções fixas em ecrãs compactos", () => {
  it("identifica a barra Guardar e os atalhos flutuantes existentes", () => {
    const save = readFileSync("src/components/mobile/SaveBar.tsx", "utf8");
    const rail = readFileSync("src/components/layout/RightRail.tsx", "utf8");
    expect(save).toContain('data-siga-save-bar=""');
    expect(save).toContain("bottom-above-nav");
    expect(rail).toContain('data-siga-rail-shortcuts=""');
    expect(rail).toContain('import "./right-rail-layout.css"');
  });

  it("afasta os atalhos só quando a barra Guardar existe", () => {
    const css = readFileSync("src/components/layout/right-rail-layout.css", "utf8");
    expect(css).toContain("body:has([data-siga-save-bar]) [data-siga-rail-shortcuts]");
    expect(css).toContain("@media (max-width: 1023px)");
    expect(css).toContain("@media (min-width: 1024px) and (max-width: 1535px)");
    expect(css).toContain("env(safe-area-inset-bottom)");
  });

  it("o chat mantém altura dinâmica e foco visível no telemóvel", () => {
    const rail = readFileSync("src/components/layout/RightRail.tsx", "utf8");
    expect(rail).toContain("h-[92dvh]");
    expect(rail).toContain("max-h-[92dvh]");
    expect(rail).toContain("focus-visible:ring-2");
  });
});
