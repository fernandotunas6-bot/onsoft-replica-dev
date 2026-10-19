import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O que fez o Lighthouse do main passar de 0,80-0,87 para 0,94-0,97 (PR #161-#163).
 * Cada regra aqui desfez um atraso medido no primeiro desenho; voltar atrás em
 * qualquer uma delas fazia a CI do main falhar outra vez.
 */
describe("orçamento do primeiro desenho", () => {
  it("browser-check.js não bloqueia o desenho (defer)", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    // Síncrono no <head>, ficava na fila atrás dos pré-carregamentos de JS e
    // o primeiro desenho esperava ~0,5 s por ele.
    expect(root).toMatch(/\{\s*src:\s*"\/browser-check\.js",\s*defer:\s*true\s*\}/);
  });

  it("o ícone pré-carregado em todas as páginas é a versão pequena", () => {
    const logo = readFileSync("src/components/ui/siga-logo.tsx", "utf8");
    // O PNG oficial (1254 px, 670 KB) disputava a rede com o CSS.
    expect(logo).not.toMatch(/src="\/brands\/siga-plus-icon\.png"/);
    expect(logo).toContain('src="/brands/siga-plus-icon-256.webp"');
    expect(statSync("public/brands/siga-plus-icon-256.webp").size).toBeLessThan(40 * 1024);
  });

  it("o favicon é um ícone pequeno, não o logótipo grande", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).toContain('href: "/favicon.png"');
    // A 12/10 o ficheiro foi trocado por um logótipo de 2007x783 (1,04 MB) e
    // o favicon real ficou ao lado como `#favicon.png`. Serve em cada página.
    const favicon = statSync("public/favicon.png");
    expect(favicon.size).toBeLessThan(32 * 1024);
    // Um favicon é quadrado; o logótipo que entrou por engano não era.
    const bytes = readFileSync("public/favicon.png");
    expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeLessThanOrEqual(256);
  });

  it("ícones e núcleo saem em poucos ficheiros (não um por ícone)", () => {
    const vite = readFileSync("vite.config.ts", "utf8");
    expect(vite).toContain('name: "icons"');
    expect(vite).toContain('name: "framework"');
  });
});
