import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WEB (portal comercial): a 11/11/2026 todas as páginas descarregavam um pedaço
 * «vendor» com todo o node_modules (590 KB) e o pacote de entrada trazia o
 * assistente /start. Medido com rede e CPU limitadas (4G lento, CPU 4×), o primeiro
 * desenho de / passou de 2,5 s para 1,9 s. Este contrato evita que volte.
 */
const web = (path: string) => readFileSync(resolve(process.cwd(), "painel/web", path), "utf8");

describe("WEB — carregamento por página", () => {
  it("só a landing vai no pacote de entrada", () => {
    const routes = web("src/config/routes.tsx");
    expect(routes).toMatch(/^import Landing from '@\/app\/landing\/page'$/m);
    for (const page of [
      "start/page",
      "pricing/page",
      "faqs/page",
      "termos/page",
      "privacidade/page",
      "download/page",
      "blog/page",
      "blog/post-page",
      "ensino-publico/page",
    ]) {
      expect(routes, page).not.toMatch(new RegExp(`^import \\w+ from '@/app/${page}'`, "m"));
      expect(routes, page).toContain(`import('@/app/${page}')`);
    }
  });

  it("sem pedaço «vendor» com todo o node_modules", () => {
    const config = web("vite.config.ts");
    expect(config).not.toMatch(/return\s+["']vendor["']/);
    expect(config).toContain('return "react"');
  });

  it("as páginas de entrada levam modulepreload no _headers gerado pelo build", () => {
    const config = web("vite.config.ts");
    expect(config).toContain("entryPageHints()");
    expect(config).toMatch(/"\/start":\s*"src\/app\/start\/page\.tsx"/);
    expect(config).toContain("rel=modulepreload");
  });

  it("o formulário de contacto carrega à parte, com um espaço reservado com a mesma âncora", () => {
    const landing = web("src/app/landing/page.tsx");
    expect(landing).not.toMatch(/^import \{ ContactSection \}/m);
    expect(landing).toContain('import("./components/contact-section")');
    expect(landing).toMatch(/fallback=\{<section id="contact"/);
    expect(landing).toContain("scrollToSection(hash)");
  });
});
