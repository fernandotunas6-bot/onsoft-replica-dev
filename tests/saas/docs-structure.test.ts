import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DOC (painel/docs). A 10/11/2026 o site tinha 12 ligações mortas escondidas por
 * `ignoreDeadLinks: true`, quatro secções do modelo de UI (shadcn, personalizador de
 * temas, Vite/Next com pnpm, Vercel e Netlify) e uma página de suporte com Discord,
 * GitHub do modelo, nove endereços inventados e testemunhos fictícios.
 */
const docs = (path: string) => resolve(process.cwd(), "painel/docs", path);
const text = (path: string) => readFileSync(docs(path), "utf8");

describe("DOC — estrutura e verdade dos conteúdos", () => {
  it("o build falha com ligações mortas (só excepções explícitas)", () => {
    const config = text(".vitepress/config.ts");
    expect(config).not.toMatch(/ignoreDeadLinks:\s*true/);
    expect(config).toMatch(/ignoreDeadLinks:\s*\[/);
    expect(config).toContain("srcExclude: ['README.md']");
  });

  it("as secções do modelo de UI saíram e os endereços antigos são redireccionados", () => {
    const redirects = text("public/_redirects");
    for (const section of ["components", "theme-customizer", "vite", "nextjs"]) {
      expect(existsSync(docs(section)), section).toBe(false);
      expect(redirects).toMatch(new RegExp(`^/${section}/\\*\\s+/\\S+\\s+301$`, "m"));
    }
  });

  it("a página de suporte só indica canais reais", () => {
    const support = text("guide/support.md");
    expect(support).toContain("suporte@portal-siga.com");
    for (const fake of [
      /discord/i,
      /shadcn-dashboard-template/,
      /Jane Smith|Mike Johnson|TechCorp/,
      /(support|hello|business|enterprise|consulting|community|docs|security)@portal-siga\.com/,
    ]) {
      expect(support).not.toMatch(fake);
    }
  });

  it("a página inicial usa os endereços do deploy, não domínios escritos à mão", () => {
    const home = text("index.md");
    expect(home).toContain("ECOSYSTEM.web");
    expect(home).toContain("ECOSYSTEM.admin");
    expect(home).not.toMatch(/https:\/\/(www|admin)\.portal-siga\.com/);
  });

  it("partilha nas redes: sem og-image inexistente nem siga-plus.local", () => {
    const config = text(".vitepress/config.ts");
    expect(config).not.toContain("content: '/og-image.png'");
    expect(config).not.toContain("content: 'https://siga-plus.local'");
    expect(config).toContain("content: `${DOCS_URL}/og-image.png`");
  });
});
