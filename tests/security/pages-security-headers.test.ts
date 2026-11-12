import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WEB, ADMIN e DOC são ficheiros estáticos no Cloudflare Pages: não passam pelo
 * Worker do SIGA (src/lib/security-headers.ts) e, até 10/11/2026, não enviavam
 * nenhum cabeçalho de segurança. A consola da plataforma podia ser embebida num
 * iframe de outro site (login, 2FA, suspensão de escolas) e indexada.
 * Os cabeçalhos vêm de public/_headers, que cada build copia para a saída.
 */

type HeaderRules = Map<string, Map<string, string>>;

function parseHeadersFile(relPath: string): HeaderRules {
  const rules: HeaderRules = new Map();
  let current: Map<string, string> | null = null;
  for (const raw of readFileSync(resolve(process.cwd(), relPath), "utf8").split("\n")) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = new Map();
      rules.set(raw.trim(), current);
      continue;
    }
    const separator = raw.indexOf(":");
    if (!current || separator < 0) throw new Error(`Linha inválida em ${relPath}: ${raw}`);
    current.set(raw.slice(0, separator).trim().toLowerCase(), raw.slice(separator + 1).trim());
  }
  return rules;
}

const BASELINE = {
  "strict-transport-security": /^max-age=\d{7,}/,
  "x-content-type-options": /^nosniff$/,
  "referrer-policy": /^strict-origin-when-cross-origin$/,
  "permissions-policy": /camera=\(\).*microphone=\(\)/,
};

const APPS = [
  { name: "WEB", file: "painel/web/public/_headers", frame: "SAMEORIGIN", ancestors: "'self'" },
  { name: "ADMIN", file: "painel/admin/public/_headers", frame: "DENY", ancestors: "'none'" },
  { name: "DOC", file: "painel/docs/public/_headers", frame: "SAMEORIGIN", ancestors: "'self'" },
] as const;

describe("cabeçalhos de segurança das apps em Cloudflare Pages", () => {
  for (const app of APPS) {
    it(`${app.name}: todas as páginas recebem a base de segurança e anti-clickjacking`, () => {
      const all = parseHeadersFile(app.file).get("/*");
      expect(all, `${app.file} sem regra /*`).toBeDefined();
      for (const [name, pattern] of Object.entries(BASELINE)) {
        expect(all?.get(name), `${app.name}: ${name}`).toMatch(pattern);
      }
      expect(all?.get("x-frame-options")).toBe(app.frame);
      expect(all?.get("content-security-policy")).toBe(`frame-ancestors ${app.ancestors}`);
    });
  }

  it("ADMIN: a consola da plataforma não é indexada", () => {
    const all = parseHeadersFile("painel/admin/public/_headers").get("/*");
    expect(all?.get("x-robots-tag")).toMatch(/noindex/);
  });

  it("a CSP destas apps só restringe quem as embebe (não bloqueia scripts nem estilos)", () => {
    for (const app of APPS) {
      const csp = parseHeadersFile(app.file).get("/*")?.get("content-security-policy") ?? "";
      expect(csp.split(";").map((part) => part.trim().split(/\s+/)[0])).toEqual([
        "frame-ancestors",
      ]);
    }
  });
});
