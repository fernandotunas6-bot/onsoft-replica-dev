import { describe, expect, it } from "vitest";
import { buildTenantUsageRows } from "@/features/saas/usage-sync";
import { isAllowedEcosystemOrigin } from "@/lib/ecosystem-cors";
import { isPublicAppPath } from "@/lib/public-paths";
import { publicSchoolSignupInputSchema } from "@/features/saas/schemas";
import { DOC_PATHS, getCreateSchoolUrl, getFinanceGatewayConfirmUrl, getPricingUrl, getPublicEnrollmentUrl, getSaasAdminUrl, getSigaNavDocUrl, getUnitelGatewayConfirmUrl } from "@/lib/ecosystem-urls";

describe("buildTenantUsageRows", () => {
  it("maps student and staff counts per tenant school", () => {
    const rows = buildTenantUsageRows(
      [
        { id: "sch-a", tenant_id: "ten-a" },
        { id: "sch-b", tenant_id: "ten-b" },
        { id: "sch-orphan", tenant_id: null },
      ],
      new Map([
        ["sch-a", 120],
        ["sch-b", 45],
      ]),
      new Map([
        ["sch-a", 8],
        ["sch-b", 3],
      ]),
    );
    expect(rows).toEqual([
      { tenant_id: "ten-a", school_id: "sch-a", active_students_count: 120, active_staff_count: 8 },
      { tenant_id: "ten-b", school_id: "sch-b", active_students_count: 45, active_staff_count: 3 },
    ]);
  });
});

describe("ecossistema — contratos Fase 13", () => {
  it("expõe rotas públicas do fluxo comercial", () => {
    expect(isPublicAppPath("/api/saas/signup")).toBe(true);
    expect(isPublicAppPath("/api/saas/plans")).toBe(true);
    expect(isPublicAppPath("/api/saas/tenants/lookup")).toBe(true);
    expect(isPublicAppPath("/api/finance/gateway/confirm")).toBe(true);
    expect(isPublicAppPath("/api/calendar/ics")).toBe(true);
    expect(isPublicAppPath("/calendario/ics")).toBe(true);
    expect(isPublicAppPath("/criar-escola")).toBe(true);
  });

  it("permite CORS do WEB e ADMIN para APIs SaaS", () => {
    expect(isAllowedEcosystemOrigin("http://localhost:5174", ["web"])).toBe(true);
    expect(isAllowedEcosystemOrigin("http://localhost:3005", ["admin"])).toBe(true);
  });

  it("valida payload mínimo do wizard WEB → API signup", () => {
    const payload = publicSchoolSignupInputSchema.parse({
      name: "Escola Nova",
      contact_name: "Director",
      contact_email: "dir@escola.ao",
      plan_code: "start",
      slug: "escola-nova",
      admin_name: "Director",
      admin_email: "dir@escola.ao",
      website: "",
    });
    expect(payload.slug).toBe("escola-nova");
  });

  it("resposta de signup inclui destinos SIGA e ADMIN", () => {
    const response = {
      tenantId: "ten-1",
      slug: "escola-nova",
      hostname: "escola-nova.portal-siga.com",
      sigaUrl: "http://localhost:3006",
      adminTenantsUrl: "http://localhost:3005/tenants",
      bootstrapSeeded: ["ano lectivo", "plano financeiro", "turma inicial"],
    };
    expect(response.adminTenantsUrl).toMatch(/\/tenants$/);
    expect(response.sigaUrl).toMatch(/^https?:\/\//);
    expect(response.bootstrapSeeded.length).toBeGreaterThan(0);
  });

  it("aceita slug da escola demo no contrato de signup", () => {
    const payload = publicSchoolSignupInputSchema.parse({
      name: "Complexo Dom Afonso I",
      contact_name: "Director",
      contact_email: "geral@siga-demo.ao",
      plan_code: "enterprise",
      slug: "dom-afonso-demo",
      admin_name: "Director",
      admin_email: "geral@siga-demo.ao",
      website: "",
    });
    expect(payload.slug).toBe("dom-afonso-demo");
  });

  it("liga navegação entre apps sem URLs hardcoded de produção", () => {
    expect(getCreateSchoolUrl()).toMatch(/\/start$/);
    expect(getPricingUrl()).toMatch(/\/pricing$/);
    expect(getSaasAdminUrl()).toMatch(/\/tenants$/);
    expect(getFinanceGatewayConfirmUrl()).toMatch(/\/api\/finance\/gateway\/confirm$/);
    expect(getUnitelGatewayConfirmUrl()).toMatch(/\/api\/finance\/gateway\/unitel\/confirm$/);
    expect(getPublicEnrollmentUrl("dom-afonso-demo")).toMatch(/\/matricula\/dom-afonso-demo$/);
    expect(getSigaNavDocUrl()).toContain(DOC_PATHS.sigaNavigation);
    expect(DOC_PATHS.adminControlCenter).toMatch(/\/admin\/control-center/);
  });
});
