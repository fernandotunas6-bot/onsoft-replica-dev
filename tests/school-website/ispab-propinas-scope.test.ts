import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: vi.fn() }));

import { schoolSiteRequest, type SchoolSite } from "@/features/school-website/school-sites";
import { isPageInScope, narrowToScope } from "@/features/school-website/site-scope";
import { renderSchoolWebsite } from "@/features/school-website/render-site";
import { readWebsiteState, websiteTemplate } from "@/features/school-website/content-model";

const delivery = "https://ispab.portal-siga.com/site/propinas/confirmacao/";
const site: SchoolSite = {
  schoolId: "school-ispab-test",
  publicCode: "ISPAB-TEST",
  name: "ISPAB",
  logoUrl: null,
  slug: "ispab",
  origin: "https://ispab.portal-siga.com",
  basePath: "/site",
  homePath: "/",
  portalUrl: "https://ispab.portal-siga.com/portal?escola=ispab",
  allowedOrigins: ["https://ispab.portal-siga.com"],
  state: readWebsiteState(null),
};

describe("Entrega segura Kursinha — ISPAB no domínio escolar existente", () => {
  it("resolve a página no hostname institucional sem interferir com a autenticação", () => {
    expect(schoolSiteRequest(new URL(delivery))).toMatchObject({
      mode: "hostname",
      value: "ispab.portal-siga.com",
      basePath: "/site",
      page: "/propinas/confirmacao/",
    });
    expect(
      schoolSiteRequest(new URL("https://ispab.portal-siga.com/portal?escola=ispab")),
    ).toBeNull();
  });

  it("permite só páginas financeiras informativas mesmo antes da publicação editorial", () => {
    expect(isPageInScope("/propinas/", [], "ispab")).toBe(true);
    expect(isPageInScope("/propinas/confirmacao/", [], "ispab")).toBe(true);
    expect(isPageInScope("/cursos/", [], "ispab")).toBe(false);
    expect(isPageInScope("/propinas/", [], "escola-b")).toBe(false);
    expect(isPageInScope("/propinas/confirmacao/", [], "escola-b")).toBe(false);
    expect(isPageInScope("/portal/financeiro/", [])).toBe(false);
  });

  it("mantém links do website gerido e remove outros links ilustrativos", () => {
    const html =
      '<main><a href="/site/propinas/">Propinas</a><a href="/site/propinas/confirmacao/">Entrega</a><a href="/site/cursos/">Cursos fictícios</a><a href="/escolas/ispab/propinas/">Propinas na origem</a></main>';
    const safe = narrowToScope(html, [], "ispab");
    const otherSchool = narrowToScope(html, [], "escola-b");
    expect(otherSchool).not.toContain('href="/site/propinas/"');
    expect(otherSchool).not.toContain('href="/site/propinas/confirmacao/"');
    expect(safe).toContain('href="/site/propinas/"');
    expect(safe).toContain('href="/site/propinas/confirmacao/"');
    expect(safe).toContain('href="/escolas/ispab/propinas/"');
    expect(safe).not.toContain('href="/site/cursos/"');
  });

  it("renderiza a entrega no mesmo website do SIGA e preserva o aviso de não liquidação", () => {
    const page = renderSchoolWebsite(site, "/propinas/confirmacao/", {
      apiVersion: 1,
      templateVersion: websiteTemplate.version,
      values: {},
      unavailablePrograms: [],
      admissions: null,
    });
    expect(page).not.toBeNull();
    expect(page).toContain(
      'href="https://ispab.portal-siga.com/portal?escola=ispab&amp;vista=estudante&amp;seccao=financeiro"',
    );
    expect(page).toContain('href="/site/propinas/"');
    expect(page).toMatch(/não cria recibos, não altera saldos e não confirma pagamentos/);
    expect(page).toContain("A abrir automaticamente a sua área financeira");
    expect(page).toContain("vista=estudante");
    expect(page).toContain("seccao=financeiro");
    expect(page).toContain('http-equiv="refresh"');
    expect(page).not.toContain("Pagamento confirmado pela Kursinha");
    const alternate = renderSchoolWebsite(
      {
        ...site,
        origin: "https://ispab.example.ao",
        portalUrl: "https://ispab.example.ao/portal?escola=ispab",
      },
      "/propinas/confirmacao/",
      {
        apiVersion: 1,
        templateVersion: websiteTemplate.version,
        values: {},
        unavailablePrograms: [],
        admissions: null,
      },
    );
    expect(alternate).toContain(
      'href="https://ispab.example.ao/portal?escola=ispab&amp;vista=estudante&amp;seccao=financeiro"',
    );
    expect(alternate).not.toContain('href="https://ispab.portal-siga.com/portal?escola=ispab"');
  });
});
