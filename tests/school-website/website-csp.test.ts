import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  SCHOOL_WEBSITE_CONTENT_SECURITY_POLICY,
  SCHOOL_WEBSITE_ENFORCED_CONTENT_SECURITY_POLICY,
} from "@/lib/csp";
import { withSecurityHeaders } from "@/lib/security-headers";

/**
 * O modelo do website escolar carrega DM Sans e Manrope do Google Fonts. Com a
 * política do SIGA (que serve a sua própria letra), cada página vista mandava 9
 * relatórios CSP ao Worker: a folha de estilos e 8 ficheiros de letra. Medido a
 * 11/11/2026 com o renderizador real em Chromium: 63 relatórios em 7 visitas; 0 com
 * a política do website.
 */
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: vi.fn() }));
vi.mock("@/features/school-website/school-sites", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/school-website/school-sites")>();
  const { readWebsiteState } = await import("@/features/school-website/content-model");
  return {
    ...original,
    loadSchoolSite: async (request: Request) => {
      const selection = original.schoolSiteRequest(new URL(request.url));
      if (!selection) return null;
      return {
        schoolId: "school-a",
        publicCode: "SCHOOL-A",
        name: "Escola A",
        logoUrl: null,
        slug: "escola-a",
        origin: "https://escola-a.portal-siga.com",
        basePath: "/site",
        homePath: "/",
        portalUrl: "https://escola-a.portal-siga.com/portal?escola=escola-a",
        allowedOrigins: [],
        state: readWebsiteState(null),
        page: selection.page,
      };
    },
  };
});
vi.mock("@/features/school-website/publication", async () => {
  const { websiteTemplate } = await import("@/features/school-website/content-model");
  return {
    loadSchoolPublication: async () => ({
      apiVersion: 1,
      templateVersion: websiteTemplate.version,
      values: {},
      unavailablePrograms: [],
      admissions: { isOpen: false, path: null },
    }),
  };
});
vi.mock("@/features/school-website/blog-server", () => ({
  loadPublishedSchoolBlog: async () => ({ posts: [] }),
}));

const directives = (policy: string) =>
  new Map(policy.split("; ").map((entry) => [entry.split(" ")[0], entry] as const));

describe("CSP do website escolar", () => {
  it("é a do SIGA mais o Google Fonts, e nada mais", () => {
    const siga = directives(CONTENT_SECURITY_POLICY);
    const website = directives(SCHOOL_WEBSITE_CONTENT_SECURITY_POLICY);
    expect([...website.keys()]).toEqual([...siga.keys()]);
    for (const [name, entry] of website) {
      const extra =
        name === "style-src"
          ? " https://fonts.googleapis.com"
          : name === "font-src"
            ? " https://fonts.gstatic.com"
            : "";
      expect(entry, name).toBe(`${siga.get(name)}${extra}`);
    }
  });

  it("o modelo só vai buscar letra a esses dois domínios", () => {
    const pages = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "src/features/school-website/site-pages.generated.json"),
        "utf8",
      ),
    ) as Record<string, string>;
    const external = new Set<string>();
    for (const html of Object.values(pages)) {
      for (const [, href] of html.matchAll(/<link\b[^>]*\bhref="(https:\/\/[^"]+)"/g)) {
        external.add(new URL(href).origin);
      }
    }
    expect([...external].sort()).toEqual([
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]);
  });

  it("as páginas levam a política do website, que o Worker não troca pela do SIGA", async () => {
    const { handleSchoolWebsite } = await import("@/features/school-website/site-http");
    for (const path of ["/", "/site/contactos/", "/site/pagina-que-nao-existe/"]) {
      const response = await handleSchoolWebsite(
        new Request(`https://escola-a.portal-siga.com${path}`),
      );
      expect(response, path).not.toBeNull();
      const served = withSecurityHeaders(response!);
      expect(served.headers.get("Content-Security-Policy-Report-Only"), path).toBe(
        SCHOOL_WEBSITE_CONTENT_SECURITY_POLICY,
      );
      expect(served.headers.get("Content-Security-Policy"), path).toBe(
        SCHOOL_WEBSITE_ENFORCED_CONTENT_SECURITY_POLICY,
      );
    }
  });

  it("obrigatória: só scripts do próprio website, o resto igual (análise 22, P1-1)", () => {
    const report = directives(SCHOOL_WEBSITE_CONTENT_SECURITY_POLICY);
    const enforced = directives(SCHOOL_WEBSITE_ENFORCED_CONTENT_SECURITY_POLICY);
    expect([...enforced.keys()]).toEqual([...report.keys()]);
    expect(enforced.get("script-src")).toBe("script-src 'self'");
    expect(enforced.get("frame-src")).toBe("frame-src 'self'");
    expect(enforced.get("object-src")).toBe("object-src 'none'");
    for (const [name, entry] of enforced) {
      if (name !== "script-src" && name !== "frame-src") expect(entry, name).toBe(report.get(name));
    }
  });

  it("o modelo não tem scripts em linha, on…= nem javascript: (senão a política parte-o)", () => {
    const pages = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "src/features/school-website/site-pages.generated.json"),
        "utf8",
      ),
    ) as Record<string, string>;
    for (const [path, html] of Object.entries(pages)) {
      for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const data = /type="application\/(?:ld\+)?json"/.test(attrs);
        const external = /\bsrc="\//.test(attrs);
        expect(data || (external && !body.trim()), `${path}: script em linha`).toBe(true);
      }
      expect(html, `${path}: handler em linha`).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
      expect(html, `${path}: javascript:`).not.toMatch(/javascript:/i);
    }
    // O mesmo para o código que o website carrega (public/_school-website).
    const dir = resolve(process.cwd(), "public/_school-website");
    for (const file of readdirSync(dir).filter((name) => /\.(m?js)$/.test(name))) {
      const code = readFileSync(resolve(dir, file), "utf8");
      expect(code, file).not.toMatch(/\beval\(|new Function\(|document\.write|javascript:/);
      expect(code, file).not.toMatch(/\son[a-z]{3,}=["'\\]/);
    }
  });
});
