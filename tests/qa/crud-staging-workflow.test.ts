import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/crud-staging-readonly.yml", "utf8");

describe("workflow E2E CRUD: execução deliberada e exclusiva em staging", () => {
  it("exige dispatch manual com confirmação e ambiente isolado", () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain('"$CONFIRMATION" != "STAGING"');
    expect(workflow).not.toMatch(/^ {2}(push|pull_request|schedule|workflow_run):/m);
  });

  it("recusa referenciar produção ou outra origem Supabase", () => {
    expect(workflow).toContain('"$SIGA_CRUD_E2E_PROJECT_REF" == "xodgfmxiaunpamctfeea"');
    expect(workflow).toContain(
      '"$SUPABASE_URL" != "https://${SIGA_CRUD_E2E_PROJECT_REF}.supabase.co"',
    );
    expect(workflow).toContain("resolveCrudStagingConfig(process.env)");
  });

  it("usa segredos apenas do ambiente staging e mantém as sessões temporárias", () => {
    expect(workflow).toContain("secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("secrets.STAGING_SUPABASE_PUBLISHABLE_KEY");
    expect(workflow).toContain("secrets.SIGA_CRUD_E2E_TENANT_A_STATE_B64");
    expect(workflow).toContain("secrets.SIGA_CRUD_E2E_TENANT_B_STATE_B64");
    expect(workflow).toContain("/tmp/siga-crud-${{ github.run_id }}-school-a.json");
    expect(workflow).toContain('rm -f "$SIGA_CRUD_E2E_TENANT_A_STATE"');
    expect(workflow).not.toContain("secrets.PRODUCTION_");
    expect(workflow).not.toContain("actions/upload-artifact");
  });

  it("executa somente o teste autenticado de leitura entre duas escolas", () => {
    expect(workflow).toContain("tests/e2e/crud-tenant-readonly.spec.ts");
    expect(workflow).toContain('SIGA_CRUD_E2E: "1"');
    expect(workflow).toContain("SIGA_CRUD_E2E_PROJECT_REF:");
    expect(workflow).toContain("VITE_SIGA_URL: http://127.0.0.1:3006");
    expect(workflow).not.toMatch(/(migrate\s+up|db\s+reset|siga:seed-demo|deploy:all)/);
  });
});
