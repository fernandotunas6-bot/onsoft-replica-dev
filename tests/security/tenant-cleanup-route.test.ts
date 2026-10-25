import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const helper = readFileSync(
  resolve(process.cwd(), "tests/e2e/helpers/sga-live-admin.ts"),
  "utf8",
);
const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ecosystem-e2e-live.yml"),
  "utf8",
);

describe("limpeza do E2E de duas escolas — staging isolado", () => {
  it("usa a rotina canónica de dependências em vez de eliminar schools por PostgREST", () => {
    expect(helper).toContain("cleanupTenantWithDependencies(admin, slug, email)");
    expect(helper).not.toContain('.from("schools").delete()');
    expect(helper).toContain('tenant.contact_email?.trim().toLowerCase() !== email');
  });

  it("não ignora uma conta criada sem tenant durante falha de signup", () => {
    expect(helper).toContain("const orphan = await findE2EAuthUserByEmail(");
    expect(helper).toContain("Limpeza incompleta: conta de ensaio sem tenant");
  });

  it("o token da Management API é injectado apenas no preflight e pipeline @live", () => {
    expect(workflow).toContain("STAGING_SUPABASE_ACCESS_TOKEN");
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN:");
    expect(workflow).not.toMatch(/^\s*VITE_SUPABASE_ACCESS_TOKEN:/m);
  });
});
